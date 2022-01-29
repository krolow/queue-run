import { AbortController } from "node-abort-controller";
import { getLocalStorage } from "..";
import { loadMiddleware, loadModule } from "../shared/loadModule.js";
import { LocalStorage, withLocalStorage } from "../shared/localStorage.js";
import { logError, logMessageReceived } from "../shared/logging.js";
import TimeoutError from "../shared/TimeoutError.js";
import type { JSONValue } from "./../json";
import { AuthenticatedUser } from "./../shared/authenticated";
import {
  WebSocketHandler,
  WebSocketMiddleware,
  WebSocketRequest,
} from "./exports.js";
import findRoute from "./findRoute.js";

// eslint-disable-next-line sonarjs/cognitive-complexity
export async function handleWebSocketConnect({
  connectionId,
  newLocalStorage,
  request,
  requestId,
}: {
  connectionId: string;
  newLocalStorage: () => LocalStorage;
  request: Request;
  requestId: string;
}): Promise<Response> {
  const { onConnect, onError } = await getCommonMiddleware();
  if (!onConnect) return new Response("", { status: 202 });

  return await withLocalStorage(newLocalStorage(), async () => {
    try {
      await onConnect({
        connectionId,
        cookies: getCookies(request),
        request,
        requestId,
      });
      return new Response("", { status: 202 });
    } catch (error) {
      if (error instanceof Response) return error;

      if (onError) {
        try {
          await onError(
            error instanceof Error ? error : new Error(String(error))
          );
        } catch (error) {
          console.error(error);
        }
      }
      return new Response("Internal Server Error", { status: 500 });
    }
  });
}

function getCookies(request: Request): { [key: string]: string } {
  const header = request.headers.get("cookie");
  if (!header) return {};
  const cookies = header
    .split(";")
    .map((cookie) => cookie.trim())
    .map((cookie) => cookie.match(/^([^=]+?)=(.*)$/)?.slice(1)!)
    .filter(([name]) => name) as [string, string][];

  return cookies.reduce(
    (cookies, [key, value]) => ({ ...cookies, [key]: value }),
    {}
  );
}

async function getCommonMiddleware() {
  const defaultMiddleware = {
    onError: logError,
    onMessageReceived: logMessageReceived,
  };
  const main = await loadModule<never, WebSocketMiddleware>(
    "socket/index",
    defaultMiddleware
  );
  if (main) return main.middleware;
  else {
    return await loadMiddleware<WebSocketMiddleware>(
      "socket",
      defaultMiddleware
    );
  }
}

// eslint-disable-next-line sonarjs/cognitive-complexity
export async function handleWebSocketMessage({
  connectionId,
  data,
  newLocalStorage,
  requestId,
  userId,
}: {
  connectionId: string;
  data: Buffer;
  newLocalStorage: () => LocalStorage;
  requestId: string;
  userId: string | null | undefined;
}) {
  try {
    const { module, middleware, route } = await findRoute(data);

    const request = {
      connectionId,
      data: bufferToData(data, module?.config?.type ?? "json"),
      requestId,
    };

    if (userId === undefined && middleware.authenticate) {
      const { authenticate } = middleware;
      const localStorage = newLocalStorage();
      localStorage.connectionId = request.connectionId;
      await withLocalStorage(localStorage, async () => {
        const authenticated = await authenticate(request);
        // The authenticate middleware may have called authenticated directly
        if (!getLocalStorage().user && authenticated)
          await getLocalStorage().authenticated(authenticated);
      });
      return;
    }

    if (!(module && route))
      throw new Error("No available handler for this request");

    await handleRoute({
      filename: route.filename,
      handler: module.default,
      middleware,
      newLocalStorage,
      request: { ...request, user: userId ? { id: userId } : null },
      timeout: route.timeout,
    });
  } catch (error) {
    console.error("Internal processing error %s", connectionId, error);
    const { onError } = await getCommonMiddleware();
    if (onError) {
      await onError(error instanceof Error ? error : new Error(String(error)));
    }
    throw error;
  }
}

async function handleRoute({
  filename,
  handler,
  middleware,
  newLocalStorage,
  request,
  timeout,
}: {
  filename: string;
  handler: WebSocketHandler;
  middleware: WebSocketMiddleware;
  newLocalStorage: () => LocalStorage;
  request: WebSocketRequest;
  timeout: number;
}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout * 1000);

  try {
    const localStorage = newLocalStorage();
    localStorage.user = request.user;
    localStorage.connectionId = request.connectionId;
    await withLocalStorage(localStorage, async () => {
      await runWithMiddleware({
        filename,
        handler,
        middleware,
        request: { ...request, signal: controller.signal },
      });
    });
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

async function runWithMiddleware({
  filename,
  handler,
  middleware,
  request,
}: {
  filename: string;
  handler: WebSocketHandler;
  middleware: WebSocketMiddleware;
  request: Parameters<WebSocketHandler>[0];
}) {
  try {
    const { signal } = request;
    await Promise.race([
      (async () => {
        const { onMessageReceived } = middleware;
        if (onMessageReceived) await onMessageReceived(request);

        await handler(request);
      })(),

      new Promise<undefined>((resolve) =>
        signal.addEventListener("abort", () => resolve(undefined))
      ),
    ]);

    if (signal.aborted) throw new TimeoutError("Request aborted: timed out");
  } catch (error) {
    await handleOnError({
      error,
      filename,
      middleware,
      request: request as WebSocketRequest,
    });
    throw error;
  }
}

function bufferToData(
  data: Buffer,
  type: "json" | "text" | "binary"
): JSONValue | string | Buffer {
  switch (type) {
    case "json":
      return JSON.parse(data.toString("utf-8")) as JSONValue;
    case "text":
      return data.toString("utf-8");
    default:
      return data;
  }
}

async function handleOnError({
  error,
  filename,
  middleware,
  request,
}: {
  error: unknown;
  filename: string;
  middleware: WebSocketMiddleware;
  request: WebSocketRequest;
}): Promise<void> {
  if (middleware.onError) {
    try {
      await middleware.onError(
        error instanceof Error ? error : new Error(String(error)),
        request
      );
    } catch (error) {
      console.error('Error in onError middleware in "%s":', filename, error);
    }
  }
}

export async function onMessageSentAsync({
  connections,
  data,
}: {
  connections: string[];
  data: Buffer;
}) {
  const { onMessageSent, onError } = await getCommonMiddleware();
  if (!onMessageSent) return;

  try {
    await onMessageSent({ connections, data });
  } catch (error) {
    if (onError) {
      try {
        await onError(
          error instanceof Error ? error : new Error(String(error))
        );
      } catch (error) {
        console.error("Error in onError middleware", error);
      }
    }
  }
}

export async function handleUserOnline({
  newLocalStorage,
  user,
}: {
  newLocalStorage: () => LocalStorage;
  user: AuthenticatedUser;
}) {
  const { onOnline, onError } = await getCommonMiddleware();
  if (!onOnline) return null;

  return await withLocalStorage(newLocalStorage(), async () => {
    try {
      await onOnline(user);
    } catch (error) {
      if (onError) {
        try {
          await onError(
            error instanceof Error ? error : new Error(String(error))
          );
        } catch (error) {
          console.error(error);
        }
      }
    }
  });
}

export async function handleUserOffline({
  newLocalStorage,
  user,
}: {
  newLocalStorage: () => LocalStorage;
  user: AuthenticatedUser;
}) {
  const { onOffline, onError } = await getCommonMiddleware();
  if (!onOffline) return null;

  return await withLocalStorage(newLocalStorage(), async () => {
    try {
      await onOffline(user);
    } catch (error) {
      if (onError) {
        try {
          await onError(
            error instanceof Error ? error : new Error(String(error))
          );
        } catch (error) {
          console.error(error);
        }
      }
    }
  });
}

import { AbortController } from "node-abort-controller";
import { Request } from "../http/fetch.js";
import { AuthenticatedUser } from "../index.js";
import { loadMiddleware, loadModule } from "../shared/loadModule.js";
import { LocalStorage, withLocalStorage } from "../shared/localStorage.js";
import TimeoutError from "../shared/TimeoutError.js";
import type { JSONValue } from "./../json";
import {
  WebSocketConfig,
  WebSocketHandler,
  WebSocketMiddleware,
  WebSocketRequest,
} from "./exports.js";
import findRoute from "./findRoute.js";

// eslint-disable-next-line sonarjs/cognitive-complexity
export async function authenticateWebSocket({
  newLocalStorage,
  request,
}: {
  newLocalStorage: () => LocalStorage;
  request: Request;
}): Promise<AuthenticatedUser | null> {
  const { authenticate, onError } = await getCommonMiddleware();
  if (!authenticate) return null;

  return await withLocalStorage(newLocalStorage(), async () => {
    let user;
    try {
      user = await authenticate(request, getCookies(request));
    } catch (error) {
      if (error instanceof Response) throw error;

      if (onError) {
        try {
          await onError(
            error instanceof Error ? error : new Error(String(error))
          );
        } catch (error) {
          console.error(error);
        }
      }
      throw error;
    }

    if (user === null || user?.id) return user;

    const concern =
      user === undefined
        ? 'Authenticate function returned "undefined", was this intentional?'
        : "Authenticate function returned user object without an ID";
    console.error(concern);
    throw new Response("Forbidden", { status: 403 });
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
  return (
    (await loadModule<never, WebSocketMiddleware>("socket/index", {}))
      ?.middleware ?? (await loadMiddleware<WebSocketMiddleware>("socket", {}))
  );
}

export async function handleWebSocketMessage({
  connection,
  data,
  newLocalStorage,
  requestId,
  userId,
}: {
  connection: string;
  data: Buffer;
  newLocalStorage: () => LocalStorage;
  requestId: string;
  userId: string | null;
}) {
  try {
    let found;
    try {
      found = await findRoute(data);
    } catch (error) {
      const { onError } = await getCommonMiddleware();
      if (onError) {
        await onError(
          error instanceof Error ? error : new Error(String(error))
        );
      }
      throw new Error("Not available");
    }

    const { middleware, module, route } = found;
    await handleRoute({
      config: module.config ?? {},
      connection,
      data,
      filename: route.filename,
      handler: module.default,
      middleware,
      newLocalStorage,
      requestId,
      timeout: route.timeout,
      userId,
    });
  } catch (error) {
    console.error("Internal processing error %s", connection, error);
    throw error;
  }
}

async function handleRoute({
  config,
  connection,
  data,
  filename,
  handler,
  middleware,
  newLocalStorage,
  requestId,
  timeout,
  userId,
}: {
  config: WebSocketConfig;
  connection: string;
  data: Buffer;
  filename: string;
  handler: WebSocketHandler;
  middleware: WebSocketMiddleware;
  newLocalStorage: () => LocalStorage;
  requestId: string;
  timeout: number;
  userId: string | null;
}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout * 1000);

  const metadata = {
    connection,
    requestId,
    signal: controller.signal,
    user: userId ? { id: userId } : null,
  };

  try {
    const localStorage = newLocalStorage();
    localStorage.user = userId ? { id: userId } : null;
    await withLocalStorage(localStorage, async () => {
      localStorage.connectionId = connection;
      await runWithMiddleware({
        config,
        data,
        handler,
        middleware,
        metadata,
        filename,
      });
    });
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

async function runWithMiddleware({
  config,
  data,
  filename,
  handler,
  metadata,
  middleware,
}: {
  config: WebSocketConfig;
  data: Buffer;
  filename: string;
  handler: WebSocketHandler;
  metadata: Omit<Parameters<WebSocketHandler>[0], "data">;
  middleware: WebSocketMiddleware;
}) {
  const { signal } = metadata;
  const request = { data: bufferToData(data, config), ...metadata };
  try {
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
  config: WebSocketConfig
): JSONValue | string | Buffer {
  switch (config.type ?? "json") {
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
  userId,
}: {
  newLocalStorage: () => LocalStorage;
  userId: string;
}) {
  const { onOnline, onError } = await getCommonMiddleware();
  if (!onOnline) return null;

  return await withLocalStorage(newLocalStorage(), async () => {
    try {
      await onOnline(userId);
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
  userId,
}: {
  newLocalStorage: () => LocalStorage;
  userId: string;
}) {
  const { onOffline, onError } = await getCommonMiddleware();
  if (!onOffline) return null;

  return await withLocalStorage(newLocalStorage(), async () => {
    try {
      await onOffline(userId);
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

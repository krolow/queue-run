import { AbortController } from "node-abort-controller";
import { getLocalStorage } from "..";
import { loadMiddleware } from "../shared/loadModule.js";
import { LocalStorage, withLocalStorage } from "../shared/localStorage.js";
import logger from "../shared/logger.js";
import { HTTPRequestError } from "./../http/exports";
import type { JSONValue } from "./../json";
import { AuthenticatedUser } from "./../shared/authenticated";
import {
  WebSocketError,
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
  const { onConnect } = await loadMiddleware<WebSocketMiddleware>("socket", {});
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
      throw new HTTPRequestError(error, request);
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

    if (userId === undefined && middleware.authenticate) {
      const { authenticate } = middleware;
      const localStorage = newLocalStorage();
      localStorage.connectionId = connectionId;
      await withLocalStorage(localStorage, async () => {
        const authenticated = await authenticate({
          connectionId,
          data: bufferToData(data, "detect"),
          requestId,
        });
        // The authenticate middleware may have called authenticated directly
        if (!getLocalStorage().user && authenticated)
          await getLocalStorage().authenticated(authenticated);
      });
      return;
    }

    const request = {
      connectionId,
      data: bufferToData(data, module?.config?.type ?? "json"),
      requestId,
      user: userId ? { id: userId } : null,
    };

    if (!(module && route))
      throw new Error("No available handler for this request");

    await handleRoute({
      handler: module.default,
      newLocalStorage,
      request,
      timeout: route.timeout,
    });
  } catch (error) {
    throw new WebSocketError(error, { connectionId, requestId });
  }
}

async function handleRoute({
  handler,
  newLocalStorage,
  request,
  timeout,
}: {
  handler: WebSocketHandler;
  newLocalStorage: () => LocalStorage;
  request: WebSocketRequest;
  timeout: number;
}) {
  const controller = new AbortController();
  const { signal } = controller;
  const timer = setTimeout(() => controller.abort(), timeout * 1000);

  try {
    const localStorage = newLocalStorage();
    localStorage.user = request.user;
    localStorage.connectionId = request.connectionId;
    await withLocalStorage(localStorage, async () => {
      await Promise.race([
        (async () => {
          logger.emit("messageReceived", request);
          await handler({ ...request, signal });
        })(),

        new Promise<undefined>((resolve) =>
          signal.addEventListener("abort", () => resolve(undefined))
        ),
      ]);
    });

    if (signal.aborted)
      throw new WebSocketError(
        new Error("Request aborted: timed out"),
        request
      );
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

function bufferToData(
  data: Buffer,
  type: "json" | "text" | "binary" | "detect"
): JSONValue | string | Buffer {
  switch (type) {
    case "detect": {
      const text = data.toString("utf-8");
      try {
        return JSON.parse(text) as JSONValue;
      } catch {
        return text;
      }
    }
    case "json":
      return JSON.parse(data.toString("utf-8")) as JSONValue;
    case "text":
      return data.toString("utf-8");
    default:
      return data;
  }
}

export async function onMessageSentAsync({
  connections,
  data,
}: {
  connections: string[];
  data: Buffer;
}) {
  logger.emit("messageSent", { connections, data });
}

export async function handleUserOnline({
  newLocalStorage,
  user,
}: {
  newLocalStorage: () => LocalStorage;
  user: AuthenticatedUser;
}) {
  const { onOnline } = await loadMiddleware<WebSocketMiddleware>("socket", {});
  if (onOnline) {
    await withLocalStorage(newLocalStorage(), async () => {
      await onOnline(user);
    });
  }
}

export async function handleUserOffline({
  newLocalStorage,
  user,
}: {
  newLocalStorage: () => LocalStorage;
  user: AuthenticatedUser;
}) {
  const { onOffline } = await loadMiddleware<WebSocketMiddleware>("socket", {});
  if (onOffline) {
    await withLocalStorage(newLocalStorage(), async () => {
      await onOffline(user);
    });
  }
}

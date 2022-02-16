import { getExecutionContext } from "..";
import { NewExecutionContext } from "../shared/execution_context";
import { withExecutionContext } from "../shared/execution_context.js";
import { loadMiddleware } from "../shared/load_module.js";
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
import findRoute from "./find_route.js";

const middlewareTimeout = 10; // seconds

// eslint-disable-next-line sonarjs/cognitive-complexity
export async function handleWebSocketConnect({
  connectionId,
  newExecutionContext: newExecutionContext,
  request,
  requestId,
}: {
  connectionId: string;
  newExecutionContext: NewExecutionContext;
  request: Request;
  requestId: string;
}): Promise<Response> {
  const { onConnect } = await loadMiddleware<WebSocketMiddleware>("socket", {});
  if (!onConnect) return new Response("", { status: 202 });

  return await withExecutionContext(
    newExecutionContext({ timeout: middlewareTimeout }),
    async () => {
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
    }
  );
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
  newExecutionContext,
  requestId,
  userId,
}: {
  connectionId: string;
  data: Buffer;
  newExecutionContext: NewExecutionContext;
  requestId: string;
  userId: string | null | undefined;
}) {
  try {
    const { module, middleware, route } = await findRoute(data);

    if (userId === undefined && middleware.authenticate) {
      const { authenticate } = middleware;
      await withExecutionContext(
        newExecutionContext({ timeout: middlewareTimeout }),
        async (context) => {
          context.connectionId = connectionId;
          const authenticated = await authenticate({
            connectionId,
            data: bufferToData(data, "detect"),
            requestId,
          });
          // The authenticate middleware may have called authenticated directly
          if (!getExecutionContext().user && authenticated)
            await getExecutionContext().authenticated(authenticated);
        }
      );
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
      newExecutionContext,
      request,
      timeout: route.timeout,
    });
  } catch (error) {
    throw new WebSocketError(error, { connectionId, requestId });
  }
}

async function handleRoute({
  handler,
  newExecutionContext,
  request,
  timeout,
}: {
  handler: WebSocketHandler;
  newExecutionContext: NewExecutionContext;
  request: WebSocketRequest;
  timeout: number;
}) {
  await withExecutionContext(
    newExecutionContext({ timeout }),
    async (context) => {
      context.user = request.user;
      context.connectionId = request.connectionId;
      logger.emit("messageReceived", request);
      await handler({ ...request, signal: context.signal });
    }
  );
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
  newExecutionContext,
  user,
}: {
  newExecutionContext: NewExecutionContext;
  user: AuthenticatedUser;
}) {
  const { onOnline } = await loadMiddleware<WebSocketMiddleware>("socket", {});
  if (onOnline)
    await withExecutionContext(
      newExecutionContext({ timeout: middlewareTimeout }),
      () => onOnline(user)
    );
}

export async function handleUserOffline({
  newExecutionContext,
  user,
}: {
  newExecutionContext: NewExecutionContext;
  user: AuthenticatedUser;
}) {
  const { onOffline } = await loadMiddleware<WebSocketMiddleware>("socket", {});
  if (onOffline)
    await withExecutionContext(
      newExecutionContext({ timeout: middlewareTimeout }),
      () => onOffline(user)
    );
}

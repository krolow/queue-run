import chalk from "chalk";
import { AbortController } from "node-abort-controller";
import {
  getLocalStorage,
  LocalStorage,
  Middleware,
  RequestHandler,
  RequestHandlerMetadata,
  RouteExports,
} from "queue-run";
import { loadServices } from "../loadServices";
import {
  APIGatewayHTTPEvent,
  APIGatewayResponse,
  asFetchRequest,
  BackendLambdaRequest,
} from "./asFetch";
import findRoute from "./findRoute";
import { HTTPRoute } from "./HTTPRoute";
export {
  APIGatewayHTTPEvent,
  APIGatewayResponse,
  BackendLambdaRequest,
} from "./asFetch";

export default async function handleHTTPRequest(
  event: BackendLambdaRequest | APIGatewayHTTPEvent,
  newLocalStorage: () => LocalStorage
): Promise<APIGatewayResponse> {
  return await asFetchRequest(event, async (request) => {
    try {
      const { routes } = await loadServices(process.cwd());
      const { module, params, route } = await findRoute(request.url, routes);

      const cors = route.cors ? corsHeaders(route) : undefined;
      if (cors && request.method === "OPTIONS")
        throw new Response(undefined, { headers: cors, status: 204 });

      checkRequest(request, route);

      const handler = getHandler(module, request.method);
      return await handleRequest({
        cors,
        filename: route.filename,
        handler,
        middleware: module,
        params,
        request,
        newLocalStorage,
        timeout: route.timeout,
      });
    } catch (error) {
      if (error instanceof Object && error.constructor.name === "Response") {
        const response = error as Response;
        return new Response(response.body, {
          headers: response.headers,
          status: response.status ?? 500,
        });
      } else {
        console.error("Internal processing error", error);
        return new Response("Internal server error", { status: 500 });
      }
    }
  });
}

function checkRequest(request: Request, route: HTTPRoute) {
  if (
    route.methods &&
    !(route.methods.has("*") || route.methods.has(request.method))
  )
    throw new Response("Method not allowed", { status: 405 });

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  if (!hasBody) return;

  if (route.accepts) {
    if (route.accepts.has("*/*")) return;

    const mimeType = request.headers.get("content-type")?.split(";")[0];
    const accepted =
      mimeType &&
      (route.accepts.has(mimeType) ||
        route.accepts.has(`${mimeType.split("/")[0]}/*`));
    if (!accepted)
      throw new Response("Unsupported Media Type", { status: 415 });
  }
}

function getHandler(module: RouteExports, method: string): RequestHandler {
  const handler =
    module[method.toLowerCase()] ??
    (method === "HEAD" ? module.get : undefined) ??
    module.default;
  if (handler) return handler;
  else throw new Response("Method not allowed", { status: 405 });
}

async function handleRequest({
  cors,
  filename,
  handler,
  middleware,
  newLocalStorage,
  params,
  request,
  timeout,
}: {
  cors?: Headers;
  filename: string;
  handler: RequestHandler;
  middleware: Middleware;
  newLocalStorage: () => LocalStorage;
  params: { [key: string]: string };
  request: Request;
  timeout: number;
}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout * 1000);
  const cookies = getCookies(request);

  try {
    const response = await Promise.race([
      getLocalStorage().run(newLocalStorage(), () =>
        runWithMiddleware({
          cors,
          handler,
          middleware,
          request,
          filename,
          metadata: { cookies, params, signal: controller.signal },
        })
      ),
      new Promise<undefined>((resolve) =>
        controller.signal.addEventListener("abort", () => resolve(undefined))
      ),
    ]);
    if (response) return response;
    else throw new Error("Request timed out");
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

async function runWithMiddleware({
  cors,
  filename,
  handler,
  middleware,
  metadata,
  request,
}: {
  cors?: Headers;
  filename: string;
  handler: RequestHandler;
  metadata: RequestHandlerMetadata;
  middleware: Middleware;
  request: Request;
}) {
  const { authenticate, onError, onRequest, onResponse } = middleware;
  try {
    if (onRequest) await onRequest(request);

    const user = authenticate
      ? await authenticate(request, metadata.cookies)
      : undefined;
    if (authenticate && !user?.id) {
      console.error(
        "Authenticate function returned an invalid user object",
        filename
      );
      throw new Response("Forbidden", { status: 403 });
    }
    getLocalStorage().getStore()!.user = user;

    const result = await handler(request, { ...metadata, user });
    const response = resultToResponse({ cors, filename, result });

    if (onResponse) await onResponse(request, response);
    return response;
  } catch (error) {
    if (error instanceof Response) throw error;

    console.error(chalk.bold.red('Error in module "%s":'), filename, error);
    if (onError) {
      await onError(
        error instanceof Error ? error : new Error(String(error)),
        request
      );
    }
    return new Response("Internal server error", { status: 500 });
  }
}

function getCookies(request: Request): { [key: string]: string } {
  const header = request.headers.get("cookie");
  if (!header) return {};
  return header
    .split(";")
    .map((cookie) => cookie.trim())
    .map((cookie) => cookie.match(/^([^=]+?)=(.*)$/)?.slice(1)!)
    .reduce(
      (cookies, [key, value]) => ({
        ...cookies,
        [key]: value,
      }),
      {}
    );
}

function corsHeaders({ methods }: { methods?: Set<string> }): Headers {
  return new Headers({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": methods
      ? Array.from(methods).join(", ")
      : "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  });
}

function resultToResponse({
  cors,
  filename,
  result,
}: {
  cors?: Headers;
  filename: string;
  result: ReturnType<RequestHandler> | undefined;
}): Response {
  if (result instanceof Response) {
    const headers = new Headers({
      ...(cors ? Object.fromEntries(cors.entries()) : undefined),
      ...Object.fromEntries(result.headers.entries()),
    });
    return new Response(result.body, { headers, status: result.status ?? 200 });
  } else if (typeof result === "string" || Buffer.isBuffer(result)) {
    const headers = new Headers(cors);
    headers.set("Content-Type", "text/plain");
    return new Response(result, { status: 200, headers });
  } else if (result) {
    const headers = new Headers(cors);
    headers.set("Content-Type", "application/json");
    return new Response(JSON.stringify(result), { status: 200, headers });
  } else {
    console.error('No response returned from module "%s"', filename);
    return new Response(undefined, { headers: cors, status: 204 });
  }
}

import chalk from "chalk";
import { AbortController } from "node-abort-controller";
import type { RequestHandler } from "queue-run";
import { Middleware } from "queue-run/src/middleware";
import { loadServices } from "../loadServices";
import findRoute from "./findRoute";
import { HTTPRoute } from "./HTTPRoute";

export default async function handleHTTPRequest(
  request: Request
): Promise<Response> {
  try {
    const { routes } = await loadServices(process.cwd());
    const { handler, middleware, params, route } = await findRoute(
      request.url,
      routes
    );

    const cors = route.cors ? corsHeaders(route) : undefined;
    if (cors && request.method === "OPTIONS")
      throw new Response(undefined, { headers: cors, status: 204 });

    checkRequest(request, route);

    return await handleRequest({
      ...middleware,
      cors,
      filename: route.filename,
      handler,
      params,
      request,
      timeout: route.timeout,
    });
  } catch (error) {
    if (error instanceof Response) {
      return new Response(error.body, {
        headers: error.headers,
        status: error.status ?? 500,
      });
    } else {
      console.error("Internal processing error", error);
      return new Response("Internal server error", { status: 500 });
    }
  }
}

function checkRequest(request: Request, route: HTTPRoute) {
  if (
    route.methods &&
    !(route.methods.has("*") || route.methods.has(request.method))
  )
    throw new Response("Method not allowed", { status: 405 });

  if (route.accepts) {
    const mimeType = request.headers.get("content-type")?.split(";")[0];
    const accepted =
      mimeType &&
      (route.accepts.has("*/*") ||
        route.accepts.has(mimeType) ||
        route.accepts.has(`${mimeType.split("/")[0]}/*`));
    if (!accepted)
      throw new Response("Unsupported Media Type", { status: 415 });
  }
}

async function handleRequest({
  cors,
  filename,
  handler,
  params,
  request,
  timeout,
  ...middleware
}: {
  cors?: Headers;
  filename: string;
  handler: RequestHandler;
  params: { [key: string]: string };
  request: Request;
  timeout: number;
} & Middleware): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout * 1000);

  try {
    const response = await Promise.race([
      runWithMiddleware({
        cors,
        handler,
        request,
        filename,
        metadata: { params, signal: controller.signal },
        ...middleware,
      }),
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
  authenticate,
  cors,
  filename,
  handler,
  metadata,
  onError,
  onRequest,
  onResponse,
  request,
}: {
  cors?: Headers;
  filename: string;
  handler: RequestHandler;
  metadata: Parameters<RequestHandler>[1];
  request: Request;
} & Middleware) {
  try {
    if (onRequest) await onRequest(request);

    const user = authenticate ? await authenticate(request) : undefined;
    if (authenticate && !user?.id) {
      console.error(
        "Authenticate function returned an invalid user object",
        filename
      );
      throw new Response("Forbidden", { status: 403 });
    }

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
  if (result instanceof Response)
    return new Response(result.body, {
      headers: { ...result.headers, ...cors },
      status: result.status ?? 200,
    });
  if (result)
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json", ...cors },
    });

  console.error('No response returned from module "%s"', filename);
  return new Response(undefined, { headers: cors, status: 204 });
}

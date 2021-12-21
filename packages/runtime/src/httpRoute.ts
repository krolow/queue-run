import chalk from "chalk";
import { AbortController } from "node-abort-controller";
import { Request, Response } from "node-fetch";
import { RequestHandler } from "./handlers";
import loadRoute from "./loadRoute";
import { loadServices } from "./loadServices";
import { Middleware } from "./middleware";

export default async function httpRoute(request: Request): Promise<Response> {
  try {
    const { routes } = await loadServices(process.cwd());
    const { handler, middleware, params, route } = await loadRoute(
      request.url,
      routes
    );

    const { checkContentType, checkMethod } = route;
    if (!checkMethod(request.method))
      throw new Response("Method not allowed", { status: 405 });
    if (!checkContentType(request.headers.get("Content-Type") ?? ""))
      throw new Response("Unsupported media type", { status: 406 });

    return await handleRequest({
      ...middleware,
      filename: route.filename,
      handler,
      params,
      request,
      timeout: route.timeout,
    });
  } catch (error) {
    if (error instanceof Response) {
      return new Response(error.body, {
        ...error,
        status: error.status ?? 500,
      });
    } else {
      console.error("Internal processing error", error);
      return new Response("Internal server error", { status: 500 });
    }
  }
}

async function handleRequest({
  filename,
  handler,
  params,
  request,
  timeout,
  ...middleware
}: {
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
  filename,
  handler,
  metadata,
  onError,
  onRequest,
  onResponse,
  request,
}: {
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
    const response = resultToResponse(result, filename);

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

function resultToResponse(
  result: ReturnType<RequestHandler> | undefined,
  filename: string
): Response {
  if (result instanceof Response)
    return new Response(result.body, {
      ...result,
      status: result.status ?? 200,
    });
  if (result)
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  console.error('No response returned from module "%s"', filename);
  return new Response(undefined, { status: 204 });
}

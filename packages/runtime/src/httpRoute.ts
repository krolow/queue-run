import glob from "fast-glob";
import { AbortController } from "node-abort-controller";
import { Request, Response } from "node-fetch";
import path from "path";
import { match } from "path-to-regexp";
import invariant from "tiny-invariant";
import { URL } from "url";
import { Middleware, RequestHandler } from "./../types";
import { RouteConfig } from "./../types/handlers.d";
import loadModule from "./loadModule";

export default async function httpRoute(request: Request): Promise<Response> {
  try {
    const { module, filename, params } = await findRoute(request);
    checkPreReq(request, module.config);
    return await handleRequest({
      ...module,
      filename,
      params,
      request,
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

async function findRoute(request: Request) {
  const routes = await loadRoutes();
  const pathname = new URL(request.url).pathname.slice(1);
  const route = routes
    .map((route) => ({
      match: route.match(pathname),
      filename: route.filename,
    }))
    .filter(({ match }) => match)
    .map(({ filename, match }) => ({
      params: match ? match.params : {},
      filename,
    }))
    .sort((a, b) => moreSpecificRoute(a.params, b.params))[0];
  if (!route) throw new Response("Not Found", { status: 404 });

  const { filename, params } = route;
  invariant(params);
  const module = await loadModule<RequestHandler, RouteConfig>(filename);
  if (!module) throw new Response("Not Found", { status: 404 });

  return { module, filename, params };
}

function moreSpecificRoute(
  a: { [key: string]: string },
  b: { [key: string]: string }
) {
  return Object.keys(a).length - Object.keys(b).length;
}

function checkPreReq(request: Request, config: RouteConfig) {
  if (config.methods) {
    const methods = new Set(
      config.methods.map((method) => method.toLowerCase())
    );
    if (!methods.has(request.method.toLowerCase()))
      throw new Response("Method not allowed", { status: 405 });
  }

  if (config.accepts) {
    const accepts = Array.isArray(config.accepts)
      ? config.accepts
      : [config.accepts];
    const contentType = request.headers.get("Content-Type");
    if (!contentType)
      throw new Response("No Content-Type header", { status: 406 });
    const isAccepted = accepts.some((accepted) =>
      accepted.endsWith("/*")
        ? accepted.split("/")[0] === contentType.split("/")[0]
        : accepted === contentType
    );
    if (!isAccepted)
      throw new Response("Unsupported media type", { status: 406 });
  }
}

async function handleRequest({
  config,
  filename,
  handler,
  params,
  request,
  ...middleware
}: {
  config: RouteConfig;
  filename: string;
  handler: RequestHandler;
  params: { [key: string]: string };
  request: Request;
} & Middleware): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    (config.timeout ?? 30) * 1000
  );

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
    clearTimeout(timeout);
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
    const user = authenticate ? await authenticate(request) : undefined;
    if (authenticate && !user?.id) {
      console.error(
        "Authenticate function returned an invalid user object",
        filename
      );
      throw new Response("Forbidden", { status: 403 });
    }

    if (onRequest) await onRequest(request);

    const result = await handler(request, { ...metadata, user });
    const response = resultToResponse(result, filename);

    if (onResponse) await onResponse(request, response);
    return response;
  } catch (error) {
    if (error instanceof Response) throw error;

    console.log('Response from module "%s" failed', filename, error);
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

async function loadRoutes() {
  const filenames = await glob("api/**/[!_]*.{js,ts}");
  return filenames.map((filename) => {
    const route = pathFromFilename(filename).replace(
      /(\/|^)\$(.*?)(\/|$)/g,
      (_, prev, key, next) => `${prev}:${key || "rest*"}${next}`
    );
    return { match: match<{ [key: string]: string }>(route), filename };
  });
}

function pathFromFilename(filename: string): string {
  const basename = path.basename(filename, path.extname(filename)).normalize();
  const directory = path.dirname(filename).normalize();
  const withoutIndex =
    basename === "index" ? directory : `${directory}/${basename}`;
  const expanded = withoutIndex.replace(/\./g, "/").replace(/\/+/g, "/");
  const valid = expanded
    .split("/")
    .every((part) => /^(\$?[a-zA-Z0-9_-]*|\$*\*)$/.test(part));
  if (!valid) throw new Error(`Cannot convert "${filename}" to a route`);
  return expanded;
}

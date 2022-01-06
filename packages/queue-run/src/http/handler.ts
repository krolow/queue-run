import chalk from "chalk";
import crypto from "crypto";
import { AbortController } from "node-abort-controller";
import { URL } from "url";
import {
  getLocalStorage,
  HTTPRoute,
  LocalStorage,
  withLocalStorage,
} from "../shared";
import {
  RequestHandler,
  RouteConfig,
  RouteExports,
  RouteMiddleware,
} from "./exports";
import { Headers, Request, Response } from "./fetch";
import findRoute from "./findRoute";

export default async function handleHTTPRequest(
  request: Request,
  newLocalStorage: () => LocalStorage
): Promise<Response> {
  try {
    // Throws 404 Not Found
    const { middleware, module, params, route } = await findRoute(request.url);

    // If we handle CORS than OPTIONS is always available, so this comes first
    const corsHeaders = getCorsHeaders(route);
    if (route.cors && request.method === "OPTIONS")
      return new Response(undefined, { headers: corsHeaders, status: 204 });

    // Throws 405 Method Not Allowed
    const handler = getHandler(module, request.method);
    // Throws 405 Method Not Allowed and 415 Unsupported Media Type
    checkRequest(request, route);

    return await handleRoute({
      config: module.config ?? {},
      corsHeaders,
      filename: route.filename,
      handler,
      middleware,
      params,
      request,
      newLocalStorage,
      timeout: route.timeout,
    });
  } catch (error) {
    // checkRequest and getHandler.  These are client errors (4xx) and we don't
    // log them.
    if (error instanceof Response) return error;
    console.error(
      chalk.bold.red("Internal processing error %s %s"),
      request.method,
      request.url,
      error
    );
    // eslint-disable-next-line sonarjs/no-duplicate-string
    return new Response("Internal Server Error", { status: 500 });
  }
}

function getCorsHeaders({
  cors,
  methods,
}: {
  cors?: boolean;
  methods?: Set<string>;
}): Headers | undefined {
  if (!cors) return undefined;
  return new Headers({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": methods
      ? Array.from(methods).join(",")
      : "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  });
}

function checkRequest(request: Request, route: HTTPRoute) {
  if (!(route.methods.has("*") || route.methods.has(request.method)))
    throw new Response("Method Not Allowed", { status: 405 });

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  if (!hasBody) return;

  if (route.accepts.has("*/*")) return;

  const mimeType = request.headers.get("content-type")?.split(";")[0]?.trim();
  const accepted =
    mimeType &&
    (route.accepts.has(mimeType) ||
      route.accepts.has(`${mimeType.split("/")[0]}/*`));
  if (!accepted) throw new Response("Unsupported Media Type", { status: 415 });
}

function getHandler(module: RouteExports, method: string): RequestHandler {
  const handler =
    module[method.toLowerCase() as keyof RouteExports] ??
    (method === "DELETE" ? module.del : undefined) ??
    (method === "HEAD" ? module.get : undefined) ??
    module.default;
  if (handler) return handler as RequestHandler;
  else throw new Response("Method Not Allowed", { status: 405 });
}

async function handleRoute({
  config,
  corsHeaders,
  filename,
  handler,
  middleware,
  newLocalStorage,
  params,
  request,
  timeout,
}: {
  config: RouteConfig;
  corsHeaders: Headers | undefined;
  filename: string;
  handler: RequestHandler;
  middleware: RouteMiddleware;
  newLocalStorage: () => LocalStorage;
  params: { [key: string]: string | string[] };
  request: Request;
  timeout: number;
}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout * 1000);

  const metadata = {
    cookies: getCookies(request),
    params,
    query: getQuery(request),
    signal: controller.signal,
  };

  try {
    const response = await Promise.race([
      withLocalStorage(newLocalStorage(), () =>
        runWithMiddleware({
          config,
          corsHeaders,
          handler,
          middleware,
          request,
          filename,
          metadata,
        })
      ),

      new Promise<undefined>((resolve) =>
        controller.signal.addEventListener("abort", () => resolve(undefined))
      ),
    ]);
    if (response) return response;
    else return new Response("Timed Out", { status: 500 });
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
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

function getQuery(request: Request): { [key: string]: string | string[] } {
  return Array.from(new URL(request.url).searchParams.entries()).reduce(
    (query, [key, value]) => {
      const existing = query[key];
      if (existing) {
        if (Array.isArray(existing)) existing.push(value);
        else query[key] = [existing, value];
      } else query[key] = value;
      return query;
    },
    {} as { [key: string]: string | string[] }
  );
}

async function runWithMiddleware({
  config,
  corsHeaders,
  filename,
  handler,
  middleware,
  metadata,
  request,
}: {
  config: RouteConfig;
  corsHeaders: Headers | undefined;
  filename: string;
  handler: RequestHandler;
  metadata: Omit<Parameters<RequestHandler>[0], "request" | "user">;
  middleware: RouteMiddleware;
  request: Request;
}): Promise<Response> {
  const { authenticate, onRequest } = middleware;
  try {
    if (onRequest) await onRequest(request);

    const user = authenticate
      ? await authenticate(request, metadata.cookies)
      : null;
    if (authenticate && !user?.id) {
      console.error(
        chalk.bold.red("Authenticate function returned an invalid user object"),
        filename
      );
      throw new Response("Forbidden", { status: 403 });
    }
    getLocalStorage().user = user;

    const result = await handler({ ...metadata, request, user });

    const response = await resultToResponse({
      addCacheControl: withCacheControl(request, config),
      corsHeaders,
      filename,
      result,
    });
    return await handleOnResponse({ filename, middleware, request, response });
  } catch (error) {
    return await handleOnError({ filename, middleware, request, error });
  }
}

// Convert whatever the request handler returns to a proper Response object
async function resultToResponse({
  addCacheControl,
  corsHeaders,
  filename,
  result,
}: {
  addCacheControl: ReturnType<typeof withCacheControl>;
  corsHeaders: Headers | undefined;
  filename: string;
  result?: ReturnType<RequestHandler>;
}): Promise<Response> {
  if (result instanceof Response) {
    const status = result.status ?? 200;
    const headers = new Headers({
      ...(corsHeaders ? Object.fromEntries(corsHeaders.entries()) : undefined),
      ...Object.fromEntries(result.headers.entries()),
    });
    if (status === 200)
      addCacheControl(headers, result, await result.clone().buffer());
    return new Response(result.body, { headers, status });
  } else if (typeof result === "string" || Buffer.isBuffer(result)) {
    const body = typeof result === "string" ? result : result.toString("utf-8");
    const headers = new Headers(corsHeaders);
    headers.set("Content-Type", "text/plain; charset=utf-8");
    addCacheControl(headers, result, body);
    return new Response(body, { headers, status: 200 });
  } else if (result) {
    const headers = new Headers(corsHeaders);
    headers.set("Content-Type", "application/json");
    const body = JSON.stringify(result);
    addCacheControl(headers, result, body);
    return new Response(JSON.stringify(result), { headers, status: 200 });
  } else {
    console.warn(
      chalk.yellow(
        'No response returned from module "%s": is this intentional?'
      ),
      filename
    );
    return new Response(undefined, { headers: corsHeaders, status: 204 });
  }
}

// Add Cache-Control and ETag headers to the response
//
// Only if the request is GET/HEAD/PUT/PATCH
// Caller makes sure only if the request is cacheable (eg 200)
function withCacheControl(request: Request, config: RouteConfig) {
  // eslint-disable-next-line sonarjs/cognitive-complexity
  return function (
    headers: Headers,
    result: Awaited<ReturnType<RequestHandler>>,
    body: string | Buffer
  ) {
    const caching = ["GET", "HEAD", "PUT", "PATCH"].includes(request.method);
    if (!caching) return;

    if (!headers.has("Cache-Control")) {
      const cache =
        typeof config.cache === "function"
          ? config.cache(result)
          : config.cache;

      const header =
        typeof cache === "number"
          ? `private, max-age=${cache.toFixed()}, must-revalidate`
          : typeof cache === "string"
          ? cache
          : undefined;
      if (header) headers.set("Cache-Control", header);
    }

    if (!headers.has("ETag")) {
      const etag =
        typeof config.etag === "function"
          ? config.etag(result)
          : config.etag === false
          ? undefined
          : crypto.createHash("md5").update(body).digest("hex");
      if (etag) headers.set("ETag", etag);
    }
  };
}

// Call onResponse and return the final response, handling any errors.  This
// method never throws.
//
// onResponse may throw an error, which we want to log and pass to onError.
// However, we cannot call onResponse again on the error, so can't use the
// error handling in runWithMiddleware.
//
// Possible flows:
// - returns response
// - calls onResponse(response) -> returns response
// - calls onResponse(response) -> throws response -> returns new response
// - calls onResponse(response) -> throws error -> onError(error) -> returns 500
async function handleOnResponse({
  filename,
  middleware,
  request,
  response,
}: {
  filename: string;
  middleware: RouteMiddleware;
  request: Request;
  response: Response;
}): Promise<Response> {
  try {
    if (middleware.onResponse) await middleware.onResponse(request, response);
    return response;
  } catch (error) {
    if (error instanceof Response) return error;

    if (middleware.onError) {
      try {
        await middleware.onError(
          error instanceof Error ? error : new Error(String(error)),
          request
        );
      } catch (error) {
        console.error(
          chalk.bold.red('Error in onError middleware in "%s":'),
          filename,
          error
        );
      }
    }
    return new Response("Internal Server Error", { status: 500 });
  }
}

// Deal with handler that throws an error or Response object.
//
// If it throws an error, we'll call onError and return a 500 response.
// If it throws a response, we'll return that response.
// Both cases, we need to call onResponse with the intended response.
//
// Error handling paths:
// - Response -> calls onResponse(response) -> returns response
// - Error -> calls onResponse(500) -> calls onError(error) -> returns 500
// - Error|Response -> calls onResponse(response) -> throws error ->
//   onError(original error) -> returns original response
// - Error|Response -> calls onResponse(response) -> throws Response ->
//   onError(original error) -> returns new response
async function handleOnError({
  error,
  filename,
  middleware,
  request,
}: {
  error: unknown;
  filename: string;
  middleware: RouteMiddleware;
  request: Request;
}): Promise<Response> {
  if (!(error instanceof Response))
    console.error(chalk.bold.red('Error in "%s":'), filename, error);

  let response: Response =
    error instanceof Response
      ? error
      : new Response("Internal Server Error", { status: 500 });

  try {
    // onResponse can always change the response by throwing a new Response.
    // However, if onResponse throws an error, we're going to log that in addition,
    // but call onError with the original error;
    if (middleware.onResponse) await middleware.onResponse(request, response);
  } catch (error) {
    if (error instanceof Response) response = error;
    else {
      console.error(
        chalk.bold.red('Error in onResponse middleware in "%s":'),
        filename,
        error
      );
    }
  }

  if (!(error instanceof Response) && middleware.onError) {
    try {
      await middleware.onError(
        error instanceof Error ? error : new Error(String(error)),
        request
      );
    } catch (error) {
      console.error(
        chalk.bold.red('Error in onError middleware in "%s":'),
        filename,
        error
      );
    }
  }

  return response;
}

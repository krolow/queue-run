import chalk from "chalk";
import crypto from "crypto";
import { AbortController } from "node-abort-controller";
import { URL, URLSearchParams } from "url";
import { XMLElement } from "xmlbuilder";
import {
  getLocalStorage,
  HTTPRoute,
  LocalStorage,
  withLocalStorage,
} from "../shared/index.js";
import {
  AuthenticatedUser,
  RequestHandler,
  RouteConfig,
  RouteExports,
  RouteMiddleware,
} from "./exports.js";
import { Headers, Request, Response } from "./fetch.js";
import findRoute from "./findRoute.js";
import form from "./form.js";

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
      return new Response(undefined, {
        headers: corsHeaders ?? {},
        status: 204,
      });

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

  if (!hasBody(request)) return;

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

  const body = hasBody(request) ? await bodyFromRequest(request.clone()) : null;

  const metadata = {
    body,
    cookies: getCookies(request),
    params,
    query: getQuery(request),
    signal: controller.signal,
  };

  try {
    return await withLocalStorage(newLocalStorage(), () =>
      runWithMiddleware({
        config,
        corsHeaders,
        handler,
        middleware,
        request,
        filename,
        metadata,
      })
    );
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
  try {
    const { signal } = metadata;

    const result = await Promise.race([
      (async () => {
        const { onRequest } = middleware;
        if (onRequest) await onRequest(request);

        const user = await getAuthenticatedUser({
          cookies: metadata.cookies,
          filename,
          middleware,
          request,
        });
        getLocalStorage().user = user;

        return await handler({ ...metadata, request, user });
      })(),

      new Promise<undefined>((resolve) =>
        signal.addEventListener("abort", () => resolve(undefined))
      ),
    ]);

    if (signal.aborted) throw new Error("Request aborted: timed out");

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

async function getAuthenticatedUser({
  cookies,
  filename,
  middleware,
  request,
}: {
  cookies: { [key: string]: string };
  filename: string;
  middleware: RouteMiddleware;
  request: Request;
}): Promise<AuthenticatedUser | null> {
  const { authenticate } = middleware;
  if (!authenticate) return null;
  const user = await authenticate(request, cookies);
  if (user === null || user?.id) return user;

  const concern =
    user === undefined
      ? 'Authenticate function returned "undefined", was this intentional?'
      : "Authenticate function returned user object without an ID";
  console.error(chalk.bold.red(concern), filename);
  throw new Response("Forbidden", { status: 403 });
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
  result?: ReturnType<RequestHandler> | undefined;
}): Promise<Response> {
  if (result instanceof Response) {
    const status = result.status ?? 200;
    const headers = new Headers({
      ...(corsHeaders ? Object.fromEntries(corsHeaders.entries()) : undefined),
      ...Object.fromEntries(result.headers.entries()),
    });
    if (status === 200) {
      const body = Buffer.from(await result.clone().arrayBuffer());
      addCacheControl(headers, result, body);
    }
    return new Response(result.body, { headers, status });
  } else if (
    result &&
    typeof result === "object" &&
    "documentObject" in result &&
    "parent" in result
  ) {
    const { body, headers } = xml(result as XMLElement, corsHeaders);
    addCacheControl(headers, result, body);
    return new Response(body, { headers, status: 200 });
  } else if (typeof result === "string") {
    const headers = new Headers(corsHeaders);
    const buffer = Buffer.from(result, "utf8");
    // eslint-disable-next-line sonarjs/no-duplicate-string
    headers.set("Content-Type", "text/plain; charset=utf-8");
    headers.set("Content-Length", buffer.byteLength.toString());
    addCacheControl(headers, result, result);
    return new Response(buffer, { headers, status: 200 });
  } else if (Buffer.isBuffer(result)) {
    const headers = new Headers(corsHeaders);
    headers.set("Content-Type", "application/octet-stream");
    headers.set("Content-Length", result.byteLength.toString());
    addCacheControl(headers, result, result);
    return new Response(result, { headers, status: 200 });
  } else if (result) {
    const { body, headers } = json(result, corsHeaders);
    addCacheControl(headers, result, body);
    return new Response(JSON.stringify(result), { headers, status: 200 });
  } else {
    // null => 204, but undefined is potentially an error
    if (result === undefined)
      console.warn(
        chalk.yellow(
          'No response returned from module "%s": is this intentional?'
        ),
        filename
      );
    return new Response(undefined, { headers: corsHeaders ?? {}, status: 204 });
  }
}

function json(object: object, corsHeaders?: Headers) {
  const indent = Number(process.env.QUEUE_RUN_INDENT) || 0;
  const body = Buffer.from(JSON.stringify(object, null, indent), "utf-8");
  const headers = new Headers(corsHeaders);
  headers.set("Content-Type", "application/json");
  headers.set("Content-Length", body.byteLength.toString());
  return { body, headers };
}

function xml(xml: XMLElement, corsHeaders?: Headers) {
  const isHTML = /^html$/i.test(xml.name);
  const indent = "  ".repeat(Number(process.env.QUEUE_RUN_INDENT) || 0);
  const pretty = !!indent;
  const serialized = isHTML
    ? xml.dtd().end({ pretty, indent })
    : xml.dec("1.0", "utf-8").end({ pretty, indent });
  const body = Buffer.from(serialized, "utf-8");
  const headers = new Headers(corsHeaders);
  headers.set(
    "Content-Type",
    isHTML ? "text/html; charset=utf-8" : "application/xml; charset=utf-8"
  );
  headers.set("Content-Length", body.byteLength.toString());
  return { body, headers };
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
    body: Buffer | string
  ) {
    const caching = ["GET", "HEAD", "PUT", "PATCH"].includes(request.method);
    if (!caching) return;

    if (!headers.has("Cache-Control")) {
      const cache =
        typeof config.cache === "function"
          ? config.cache(result)
          : config.cache;

      const header =
        cache &&
        (typeof cache === "number"
          ? `private, max-age=${cache.toFixed()}, must-revalidate`
          : cache);
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

async function bodyFromRequest(
  request: Request
): Promise<object | string | Buffer | null> {
  const contentType = request.headers.get("content-type");
  const mimeType = contentType?.split(";")[0];

  switch (mimeType) {
    case "application/json": {
      try {
        return (await request.json()) as object;
      } catch (error) {
        throw new Response("application/json: not a valid JSON document", {
          status: 422,
        });
      }
    }

    case "application/octet-stream": {
      const buffer = await request.arrayBuffer();
      if (!buffer.byteLength)
        throw new Response("application/octet-stream: no message body", {
          status: 422,
        });
      return Buffer.from(buffer);
    }

    case "application/x-www-form-urlencoded": {
      const text = await request.text();
      const params = new URLSearchParams(text);
      return Object.fromEntries(params.entries());
    }

    case "multipart/form-data": {
      try {
        const fields = await form(request);
        if (
          Object.values(fields)
            .flat()
            .some((field) => typeof field !== "string" && "name" in field)
        )
          throw new Error("multipart/form-data: files not supported");
        return fields;
      } catch (error) {
        throw new Response(String(error), { status: 422 });
      }
    }

    case "text/plain": {
      const text = await request.text();
      if (!text)
        throw new Response("text/plain: no message body", { status: 422 });
      return text;
    }

    case undefined: {
      // No content type (eg testing with curl), we assume JSON.
      return (await request.json().catch(() => null)) as object;
    }

    default: {
      return null;
    }
  }
}

function hasBody(request: Request) {
  return !(
    request.method === "GET" ||
    request.method === "HEAD" ||
    request.method === "OPTIONS"
  );
}

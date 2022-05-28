import { createHash } from "node:crypto";
import { URL, URLSearchParams } from "node:url";
import { XMLElement } from "xmlbuilder";
import { AuthenticatedUser } from "../index.js";
import { isElement, render } from "../jsx-runtime.js";
import {
  getExecutionContext,
  NewExecutionContext,
  withExecutionContext,
} from "../shared/execution_context.js";
import logger from "../shared/logger.js";
import { HTTPRoute } from "../shared/manifest.js";
import {
  HTTPRequest,
  HTTPRequestError,
  RequestHandler,
  RouteConfig,
  RouteExports,
  RouteMiddleware,
} from "./exports.js";
import findRoute from "./find_route.js";
import url from "./url.js";

url.rootDir = "api/";

export default async function handleHTTPRequest({
  newExecutionContext,
  request,
  requestId,
}: {
  newExecutionContext: NewExecutionContext;
  request: Request;
  requestId: string;
}): Promise<Response> {
  try {
    logger.emit("request", request);
    // Throws 404 Not Found
    const { middleware, module, params, route } = await findRoute(request.url);

    // If we handle CORS than OPTIONS is always available, so this comes first
    const corsHeaders = getCorsHeaders(route);
    if (route.cors && request.method === "OPTIONS") {
      return new Response(undefined, {
        headers: corsHeaders ?? {},
        status: 204,
      });
    }

    // Throws 405 Method Not Allowed
    const handler = getHandler(module, request.method);
    // Throws 405 Method Not Allowed and 415 Unsupported Media Type
    checkRequest(request, route);

    const response = await handleRoute({
      config: module.config ?? {},
      corsHeaders,
      filename: route.filename,
      handler,
      middleware,
      params,
      request,
      requestId,
      newExecutionContext,
      timeout: route.timeout,
    });
    logger.emit("response", request, response);
    return response;
  } catch (error) {
    // Throwing response acceptable, eg 404 when we can't find a matching route
    // Everything else, we'll let the process crash
    if (error instanceof Response) return error;
    else throw new HTTPRequestError(error, request);
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
  newExecutionContext,
  params,
  request,
  requestId,
  timeout,
}: {
  config: RouteConfig;
  corsHeaders: Headers | undefined;
  filename: string;
  handler: RequestHandler;
  middleware: RouteMiddleware;
  newExecutionContext: NewExecutionContext;
  params: { [key: string]: string | string[] };
  request: Request;
  requestId: string;
  timeout: number;
}): Promise<Response> {
  const body = hasBody(request) ? await bodyFromRequest(request.clone()) : null;
  return await withExecutionContext(
    newExecutionContext({ timeout }),
    (context) => {
      const metadata: Omit<HTTPRequest, "request" | "user"> = {
        body: body as HTTPRequest["body"],
        cookies: getCookies(request),
        params,
        query: getQuery(request),
        requestId,
        signal: context.signal,
      };

      return runWithMiddleware({
        config,
        corsHeaders,
        filename,
        handler,
        metadata,
        middleware,
        request,
        requestId,
      });
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
    .filter(entry => entry && entry.slice(-1)) as [string, string][];

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
  requestId,
}: {
  config: RouteConfig;
  corsHeaders: Headers | undefined;
  filename: string;
  handler: RequestHandler;
  metadata: Omit<HTTPRequest, "request" | "user">;
  middleware: RouteMiddleware;
  request: Request;
  requestId: string;
}): Promise<Response> {
  try {
    const { onRequest } = middleware;
    if (onRequest) await onRequest(request);

    const user = await getAuthenticatedUser({
      ...metadata,
      middleware,
      request,
      requestId,
    });
    const result = await handler({ ...metadata, request, user });

    const response = await resultToResponse({
      addCacheControl: withCacheControl(request, config),
      corsHeaders,
      filename,
      result,
    });
    if (middleware.onResponse) await middleware.onResponse(request, response);
    return response;
  } catch (error) {
    if (error instanceof Response) {
      if (middleware.onResponse) await middleware.onResponse(request, error);
      return error;
    } else throw error;
  }
}

async function getAuthenticatedUser({
  cookies,
  query,
  middleware,
  request,
  requestId,
}: {
  cookies: { [key: string]: string };
  query: { [key: string]: string | string[] };
  middleware: RouteMiddleware;
  request: Request;
  requestId: string;
}): Promise<AuthenticatedUser | null> {
  const { authenticate } = middleware;
  if (!authenticate) return null;

  const authorization = request.headers.get("Authorization");
  const bearerToken = authorization?.match(/^Bearer\s+(\S+)$/)?.[1];
  const basic = authorization?.match(/^Basic\s+(\S+)$/)?.[1];
  const [username, password] = basic
    ? Buffer.from(basic, "base64").toString().split(":")
    : [];

  const authenticated = await authenticate({
    bearerToken,
    cookies,
    password,
    query,
    request,
    requestId,
    username,
  });
  // The authenticate middleware may have called authenticated directly
  if (!getExecutionContext().user && authenticated)
    await getExecutionContext().authenticated(authenticated);
  const { user } = getExecutionContext();
  if (user !== undefined) return user;

  process.emitWarning(
    new Error(
      'Authenticate function returned "undefined", was this intentional?'
    )
  );
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

    const headers = new Headers();
    if (corsHeaders)
      corsHeaders.forEach((value, key) => headers.append(key, value));
    result.headers.forEach((value, key) => headers.append(key, value));

    if (status === 200) {
      const body = Buffer.from(await result.clone().arrayBuffer());
      addCacheControl(headers, result, body);
    }
    return new Response(result.body, { headers, status });
  } else if (isElement(result)) {
    const { body, headers } = xml(result, corsHeaders);
    addCacheControl(headers, body, body);
    return new Response(body, { headers, status: 200 });
  } else if (typeof result === "string") {
    const headers = new Headers(corsHeaders);
    const buffer = Buffer.from(result, "utf8");
    // eslint-disable-next-line sonarjs/no-duplicate-string
    headers.set("Content-Type", "text/plain; charset=utf-8");
    // eslint-disable-next-line sonarjs/no-duplicate-string
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
    return new Response(body, { headers, status: 200 });
  } else {
    // null => 204, but undefined is potentially an error
    if (result === undefined) {
      process.emitWarning(
        `No response returned from module "${filename}": is this intentional?`
      );
    }
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
  const indent = "  ".repeat(Number(process.env.QUEUE_RUN_INDENT) || 0);
  const { text, type } = render(xml, indent);
  const body = Buffer.from(text, "utf-8");
  const headers = new Headers(corsHeaders);
  headers.set("Content-Type", type);
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
          : createHash("md5").update(body).digest("hex");
      if (etag) headers.set("ETag", etag);
    }
  };
}

async function bodyFromRequest(
  request: Request
): Promise<object | string | Buffer | null> {
  const contentType = request.headers.get("content-type");
  const mimeType = contentType?.split(";")[0];

  switch (mimeType) {
    case "application/json": {
      try {
        return (await request.clone().json()) as object;
      } catch (error) {
        throw new Response("application/json: not a valid JSON document", {
          status: 422,
        });
      }
    }

    case "application/octet-stream": {
      const buffer = await request.clone().arrayBuffer();
      if (!buffer.byteLength)
        throw new Response("application/octet-stream: no message body", {
          status: 422,
        });
      return Buffer.from(buffer);
    }

    case "application/x-www-form-urlencoded": {
      const text = await request.clone().text();
      const params = new URLSearchParams(text);
      return Object.fromEntries(params.entries());
    }

    case "multipart/form-data": {
      try {
        const form = (await request.clone().formData()) as unknown as {
          entries: () => [string, string | File][];
        };
        return Object.fromEntries(form.entries());
      } catch (error) {
        throw new Response(String(error), { status: 422 });
      }
    }

    case "text/plain": {
      const text = await request.clone().text();
      if (!text)
        throw new Response("text/plain: no message body", { status: 422 });
      return text;
    }

    case undefined: {
      // No content type (eg testing with curl), we assume JSON.
      return (await request
        .clone()
        .json()
        .catch(() => null)) as object;
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

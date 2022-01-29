/* eslint-disable no-unused-vars */
import type { AbortSignal } from "node-abort-controller";
import { JSONValue } from "../json";
import { AuthenticatedUser } from "../shared/authenticated.js";
import { OnError } from "../shared/onError.js";

/**
 * HTTP request handler.
 *
 * @param body The request body
 * @param cookies The cookies
 * @param query The query parameters
 * @param params The path parameters
 * @param request The HTTP request
 * @param requestId The unique request ID
 * @param signal The abort signal
 * @param user The authenticated user
 * @return HTTP Response, object (as application/json), string (as text/plain),
 * or buffer (as application/octet-stream)
 */
export type RequestHandler<
  Types extends {
    body: Body;
    path: Params;
    query: Params;
    response: HTTPResponse;
  } = {
    body: Body;
    path: Params;
    query: Params;
    response: HTTPResponse;
  }
> = (
  args: HTTPRequest<Types>
) => Promise<Types["response"]> | Types["response"];

export type HTTPRequest<
  Types extends {
    body?: Body;
    path?: Params;
    query?: Params;
  } = {
    body: Body;
    path: Params;
    query: Params;
  }
> = {
  body: Types["body"] | undefined;
  cookies: { [key: string]: string };
  query: Types["query"];
  params: Types["path"];
  request: Request;
  requestId: string;
  signal: AbortSignal;
  user: { id: string; [key: string]: unknown } | null;
};
type Body = JSONValue | string | Buffer;
type Params = { [key: string]: string | string[] };

export type HTTPResponse = object | string | Buffer | null;

/**
 * Export config object to control various aspects of request handling.
 */
export type RouteConfig = {
  /**
   * Accepted content types. Default to accept all content types (`*\/*`).
   */

  accepts?: string[] | string;
  /**
   * Accepted HTTP methods. Defaults to all exported methods, of when using the
   * default export, all methods are allowed ('*').
   */

  methods?: HTTPMethod | HTTPMethod[];
  /**
   * True to allow CORS requests (default: true).
   */
  cors?: boolean;

  /**
   * The Cache-Control header.
   *
   * - string - Use that as the Cache-Control header for all 200 responses
   * - number - Cache for that many seconds for all 200 responses (0 will not
   * set header)
   * - function - Called with the result of the handler, and should return a
   * header value (string) or cache duration (number)
   */
  cache?: string | number | ((result: HTTPResponse) => string | number);

  /**
   * The ETag header.
   *
   * - true - Set the ETag header from a hash of the response (default: true)
   * - false - Do not set the ETag header
   * - function - Called with the result of the handler, and should return the ETag value
   */
  etag?: boolean | ((result: HTTPResponse) => string);

  /**
   * Timeout for processing the request (in seconds)
   *
   * @default 10 seconds
   */
  timeout?: number;
};

type HTTPMethod =
  | "DELETE"
  | "GET"
  | "HEAD"
  | "OPTIONS"
  | "PATCH"
  | "POST"
  | "PUT";

/**
 * Middleware that's called for every HTTP request, to authenticate the user.
 *
 * @param bearerToken The bearer token, if using Authorization: Bearer <token>
 * @param cookies Cookies sent by the browser
 * @param password The password, if using Authorization: Basic
 * @param query The query parameters
 * @param request The HTTP request
 * @param requestId The unique request ID
 * @param username The username, if using Authorization: Basic
 * @return The authenticated user, or null if the user is not authenticated
 */
export type HTTPAuthenticateMethod = (params: {
  bearerToken: string | undefined;
  cookies: { [key: string]: string };
  password: string | undefined;
  query: { [key: string]: string | string[] };
  request: Request;
  requestId: string;
  username: string | undefined;
}) => AuthenticatedUser | Promise<AuthenticatedUser | null> | null;

/**
 * Middleware that's called for every HTTP request.
 *
 * @param request The HTTP request
 */
export type OnRequest = (request: Request) => void | Promise<void>;

/**
 * Middleware that's called for every HTTP response.
 *
 * @param request The HTTP request
 * @param response The HTTP response
 */
export type OnResponse = (
  request: Request,
  response: Response
) => void | Promise<void>;

/**
 * Middleware exported from the route module, or api/_middleware.ts.
 */
export type RouteMiddleware = {
  authenticate?: HTTPAuthenticateMethod | null;
  onError?: OnError | null;
  onRequest?: OnRequest | null;
  onResponse?: OnResponse | null;
};

/**
 * Exported from the route module.
 */
export type RouteExports = {
  config?: RouteConfig;
  /**
   * Used method handlers (get, post, etc) or default handler but not both.
   */
  default?: RequestHandler;
  get?: RequestHandler;
  /**
   * In JavaScript delete is a reserved keyword, so have to use del instead
   */
  del?: RequestHandler;
  head?: RequestHandler;
  options?: RequestHandler;
  patch?: RequestHandler;
  post?: RequestHandler;
  put?: RequestHandler;
} & RouteMiddleware;

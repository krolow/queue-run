/* eslint-disable no-unused-vars */
import type { AbortSignal } from "node-abort-controller";
import { OnError } from "../shared/index.js";
import type { Request, Response } from "./fetch.js";

/**
 * HTTP request handler.
 *
 * @params args.cookies The cookies
 * @params args.query The query parameters
 * @params args.params The path parameters
 * @params args.request The HTTP request
 * @params args.signal The abort signal
 * @params args.user The authenticated user
 * @return HTTP Response, object (as application/json), string (as text/plain),
 * or buffer (as application/octet-stream)
 */
export type RequestHandler<
  P = { [key: string]: string | string[] },
  Q = { [key: string]: string | string[] }
> = (args: {
  cookies: { [key: string]: string };
  query: Q;
  params: P;
  request: Request;
  signal: AbortSignal;
  user: { id: string; [key: string]: unknown } | null;
}) => Promise<Result> | Result;

type Result = Response | string | Buffer | object;

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
  cache?: string | number | ((result: Result) => string | number);

  /**
   * The ETag header.
   *
   * - true - Set the ETag header from a hash of the response (default: true)
   * - false - Do not set the ETag header
   * - function - Called with the result of the handler, and should return the ETag value
   */
  etag?: boolean | ((result: Result) => string);

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
 * Authenticated user returned from the authenticate middleware.
 *
 * The `id` property is required.
 */
export type AuthenticatedUser = { id: string; [key: string]: unknown };

/**
 * Middleware that's called for every HTTP request, to authenticate the user.
 *
 * @param request The HTTP request
 * @param cookies Cookies from the request
 * @return The authenticated user, or null if the user is not authenticated
 */
export type AuthenticateMethod = (
  request: Request,
  cookies: { [key: string]: string }
) => AuthenticatedUser | Promise<AuthenticatedUser | null> | null;

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
  authenticate?: AuthenticateMethod | null;
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

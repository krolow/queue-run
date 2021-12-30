/* eslint-disable no-unused-vars */
import type { AbortSignal } from "node-abort-controller";
import { OnError } from "../shared/logError";
import type { Request, Response } from "./fetch";

export type RequestHandler<
  P = { [key: string]: string | string[] },
  Q = { [key: string]: string | string[] }
> = (args: {
  cookies: { [key: string]: string };
  query: Q;
  params: P;
  request: Request;
  signal: AbortSignal;
  user?: { id: string; [key: string]: unknown };
}) => Promise<Result> | Result;

type Result = Response | string | Buffer | object;

// You can export this to control some aspects of the request handling.
//
// For example, accept only JSON requests:
//
// export const config = {
//   accepts: "application/json",
// };
export type RouteConfig = {
  // Only accepts requests with these content type(s).
  //
  // For example, the JSON API, `config.accepts = ["application/json"];`.
  //
  // Default to '*/*' (any content types).
  accepts?: string[] | string;

  // Add Cache-Control headers to responses.
  //
  // string - Use this as Cache-Control header, eg "no-cache"
  // number - Use this as the max-age value, eg 60 (seconds)
  // function - Called with the result of the request handler, returns string or number
  cache?: string | number | ((result: Result) => string | number);

  // True if this route supports CORS (default: true).
  cors?: boolean;

  // Add ETag headers to responses.
  //
  // true - Add ETag header based on the content of the response (default)
  // function - Called with the result of the request handler, returns the ETag
  etag?: boolean | ((result: Result) => string);

  // Only accepts requests with specific HTTP method(s).
  //
  // This is only useful if you export a default route handler. If you export method
  // routes, than the accepted method list is determined based on the exports.
  //
  // Default to '*' (all methods).
  //
  // If you want to handle the OPTIONS method, you need to set `cors` to false as well.
  methods?: HTTPMethod | HTTPMethod[];

  // Timeout for processing the request. In seconds. Defaults to 30.
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

// Successful authentication returns an object with the user ID.
//
// If you include additional properties, these are passed along to the HTTP
// request handler.  WebSocket and queued job handlers only see the user ID.
export type AuthenticatedUser = { id: string; [key: string]: unknown };

// HTTP and WebSocket use this to authenticate the request and return the
// authenticated user.
//
// Successful authentication should return an object with the user ID.
//
// If authentication fails, this function should throw a Response object with
// the appropriate status code (401/403).
//
// Default behavior is to return 403 if this function throws an error, or
// returns anything other than a user object.
export type AuthenticateMethod = (
  request: Request,
  // Parsed cookies.
  cookies: { [key: string]: string }
) => AuthenticatedUser | Promise<AuthenticatedUser>;

// This middleware runs on every HTTP request.  You can use it to log the
// request.
//
// You can also block the request by throwing a Response object.
export type OnRequest = (request: Request) => void | Promise<void>;

// This middleware runs on every HTTP response.  You can use it to log the
// response.
//
// You can also modify the response by throwing a Response object.
export type OnResponse = (
  request: Request,
  response: Response
) => void | Promise<void>;

// Route middleware runs before and after the request.
//
// You can export route middleware from the route itself. To share middleware
// between routes, export it from a file named _middleware.js. The most specific
// middleware applies to any route: exported from the route itself, then
// _middleware in the same directory, then parent directory, etc.
export type RouteMiddleware = {
  authenticate?: AuthenticateMethod | null;
  onError?: OnError;
  onRequest?: OnRequest;
  onResponse?: OnResponse;
};

// All of these can be exported from the route itself.
//
// You can export routes for only the HTTP methods you want to handle. If the
// request uses an HTTP method with no specific handler, the default export is
// used instead. If there is no default export, the response is 415 Unsupported
// Media Type.
export type RouteExports = {
  config?: RouteConfig;
  default?: RequestHandler;
  // In JavaScript delete is a reserved keyword, so have to use del instead
  del?: RequestHandler;
  get?: RequestHandler;
  head?: RequestHandler;
  options?: RequestHandler;
  patch?: RequestHandler;
  post?: RequestHandler;
  put?: RequestHandler;
} & RouteMiddleware;

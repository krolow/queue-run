/* eslint-disable no-unused-vars */
import type { AbortSignal } from "node-abort-controller";
import type { Request, Response } from "../http/fetch";
import {
  AuthenticateMethod,
  OnError,
  OnRequest,
  OnResponse,
} from "./middleware";

// HTTP request handler.
//
// The first argument is the request object.  The second argument includes
// URL parameters, user (if authenticated), cookies, and the abort signal.
//
// When using TypeScript, you can type the JSON body of the request:
//
// export async function put<Todo, { id: string }>(request, { params }) {
//   const todo = await request.json();
//   // todo has type Todo
//   const id = params.id;
//   // id has type string
//   . . .
// }
export type RequestHandler<T = object, P = Params> = (
  request: Request,
  metadata: RequestHandlerMetadata<P>
) => Promise<Result> | Result;

type Params = { [key: string]: string | string[] };
type Result = Response | string | Buffer | object;

export type RequestHandlerMetadata<P = Params> = {
  // Parsed cookies.
  cookies: { [key: string]: string };
  // Parameters from the request URL, eg /project/[projectId] will have the
  // parameter `projectId`.  [name] parameter will be a string, [...name]
  // parameter an array of strings.
  params: P;
  // Notified when request timed out, use this to abort further processing.
  signal: AbortSignal;
  // If authenticted, the user ID and any other properties
  user?: { id: string; [key: string]: unknown };
};

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

// Route middleware runs before and after the request.
//
// You can export route middleware from the route itself. To share middleware
// between routes, export it from a file named _middleware.js. The most specific
// middleware applies to any route: exported from the route itself, then
// _middleware in the same directory, then parent directory, etc.
export type RouteMiddleware = {
  authenticate?: AuthenticateMethod | null;
  onError?: OnError<Request> | null;
  onRequest?: OnRequest | null;
  onResponse?: OnResponse | null;
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

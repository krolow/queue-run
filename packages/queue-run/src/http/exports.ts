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

export type RouteConfig = {
  accepts?: string[] | string;
  methods?: HTTPMethod | HTTPMethod[];
  cors?: boolean;
  cache?: string | number | ((result: Result) => string | number);
  etag?: boolean | ((result: Result) => string);
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
export type RouteMiddleware = {
  authenticate?: AuthenticateMethod | null;
  onError?: OnError;
  onRequest?: OnRequest;
  onResponse?: OnResponse;
};

// All of these can be exported from the route itself.
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

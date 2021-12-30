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

export type AuthenticatedUser = { id: string; [key: string]: unknown };

export type AuthenticateMethod = (
  request: Request,
  cookies: { [key: string]: string }
) => AuthenticatedUser | Promise<AuthenticatedUser>;

export type OnRequest = (request: Request) => void | Promise<void>;

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

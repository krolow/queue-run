/* eslint-disable no-unused-vars */
import type { Request, Response } from "node-fetch";

// Successful authentication returns an object with the user ID.
type AuthenticatedUser = { id: string; [key: string]: unknown };

// Export this method from your module or middleware to authenticate this route/queue.
//
// Successful authentication should return an object with user ID. It can return
// additional user properties (name, email, etc). Only the ID is required.
//
// If authentication fails, this function should throw a Response object with
// the appropriate status code (401/403).
export declare type AuthenticateMethod = (
  request: Request
) => AuthenticatedUser | Promise<AuthenticatedUser>;

// This middleware runs on every HTTP request, including when a message is sent
// to a queue.
//
// You can use it to log the request. You can also block the request by throwing
// a Response object.
export declare type OnRequest = (request: Request) => void | Promise<void>;

// This middleware runs on every HTTP response.
export declare type OnResponse = (
  request: Request,
  response: Response
) => void | Promise<void>;

// This middleware runs if your request or message handler throws an error.
export declare type OnError = (
  error: Error,
  reference: unknown
) => void | Promise<void>;

export declare type Middleware = {
  // This middleware runs first to authenticate the request.
  //
  // Use `export const authenticate = null;` if you want to disable
  // authentication for this route, and ignore any authentication added to the
  // parent route.
  authenticate?: AuthenticateMethod | null;

  // This middleware runs for every HTTP request, including when a message is
  // sent to a queue.
  onRequest?: OnRequest;

  // This middleware runs for every HTTP response.
  onResponse?: OnResponse;

  // This middleware runs if your request or message handler throws an error.
  onError?: OnError;
};

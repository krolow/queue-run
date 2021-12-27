/* eslint-disable no-unused-vars */
import type { Request, Response } from "../http/fetch";

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

// This middleware runs if your request or message handler throws an error.
export type OnError<Reference> = (
  error: Error,
  reference?: Reference
) => void | Promise<void>;

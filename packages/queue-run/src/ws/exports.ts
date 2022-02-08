/* eslint-disable no-unused-vars */
import type { AbortSignal } from "node-abort-controller";
import type { JSONValue } from "../json";
import { AuthenticatedUser } from "../shared/authenticated";

/**
 * WebSocket message handler.
 *
 * @param connectionId Connection identifier
 * @param data The message data, type depends on `config.type`
 * @param requestId Unique ID for this message
 * @param signal The abort signal
 * @param user The authenticated user
 */
export type WebSocketHandler<
  Data extends JSONValue | string | Buffer = JSONValue | string | Buffer
> = (
  request: WebSocketRequest<Data> & {
    signal: AbortSignal;
  }
) => void | Promise<void>;

export type WebSocketRequest<
  Data extends JSONValue | string | Buffer = JSONValue | string | Buffer
> = {
  connectionId: string;
  data: Data;
  requestId: string;
  user: { id: string; [key: string]: unknown } | null;
};

export type WebSocketConfig = {
  /**
   * Message type for this WebSocket. Default: "json".
   *
   * - json: Parse message as JSON and call handler with an object
   * - text: Call handler with a string
   * - binary: Call handler with Buffer
   */
  type?: "json" | "text" | "binary";

  /**
   * Timeout for processing the request (in seconds)
   *
   * @default 10 seconds
   */
  timeout?: number;
};

/**
 * Middleware that's called for every HTTP request, to authenticate the user.
 *
 * @param connectionId Connection identifier
 * @param data The message data, type depends on `config.type`
 * @param requestId Unique ID for this message
 * @return The authenticated user, or null if the user is not authenticated
 */
export type WebSocketAuthenticateMethod = (params: {
  connectionId: string;
  data: string | JSONValue;
  requestId: string;
}) => AuthenticatedUser | Promise<AuthenticatedUser | null> | null;

/**
 * Middleware that's called the first time the user connects with WebSocket.
 *
 * @param user.id The user ID
 */
export type OnOnline = (user: AuthenticatedUser) => void | Promise<void>;

/**
 * Middleware that's called after the user has closed all WebSocket connections.
 *
 * @param user.id The user ID
 */
export type OnOffline = (user: AuthenticatedUser) => void | Promise<void>;

/**
 * Middleware that's called when client makes the HTTP request to open a
 * WebSocket connection.
 *
 * @param cookies Cookies sent by the browser
 * @param connectionId The connection ID
 * @param request The HTTP request
 * @param requestId The unique request ID
 * @throws Throw a Response object if you want to terminate the connection
 */
export type OnConnect = (params: {
  connectionId: string;
  cookies: { [key: string]: string };
  request: Request;
  requestId: string;
}) => Promise<void> | void;

/**
 * Middleware exported from the route module, or socket/_middleware.ts.
 */
export type WebSocketMiddleware = {
  authenticate?: WebSocketAuthenticateMethod | null;
  onConnect?: OnConnect | null;
  onOnline?: OnOnline | null;
  onOffline?: OnOffline | null;
};

export class WebSocketError extends Error {
  readonly cause: unknown;
  readonly connectionId: string;
  readonly requestId: string;

  constructor(
    cause: unknown,
    { connectionId, requestId }: { connectionId: string; requestId: string }
  ) {
    super(String(cause));
    this.cause = cause;
    this.connectionId = connectionId;
    this.requestId = requestId;
  }

  get stack() {
    return this.cause instanceof Error ? this.cause.stack! : super.stack!;
  }
}

/**
 * Exported from the route module.
 */
export type WebSocketExports = {
  config?: WebSocketConfig;
  default: WebSocketHandler;
} & WebSocketMiddleware;

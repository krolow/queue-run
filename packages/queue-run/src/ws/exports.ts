/* eslint-disable no-unused-vars */
import type { AbortSignal } from "node-abort-controller";
import { AuthenticateMethod } from "../http/index.js";
import { OnError } from "../shared/index.js";

/**
 * WebSocket message handler.
 *
 * @param connection Connection identifier
 * @param data The message data, type depends on `config.type`
 * @param signal The abort signal
 * @param user The authenticated user
 * @return Optional response to send back
 */
export type WebSocketHandler<P = { [key: string]: string | string[] }> =
  (args: {
    connection: string;
    data: object | string | Buffer;
    signal: AbortSignal;
    user: { id: string; [key: string]: unknown } | null;
  }) => Promise<Result> | Result;

type Result = object | string | Buffer | ArrayBuffer | undefined;

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
 * Middleware that's called for every WebSocket message received.
 *
 * @param connection Connection identifier
 * @param data The raw message data
 * @param signal The abort signal
 * @param user The authenticated user
 */
export type OnMessageReceived = (args: {
  connection: string;
  data: object | string | Buffer;
  signal: AbortSignal;
  user: { id: string; [key: string]: unknown } | null;
}) => void | Promise<void>;

/**
 * Middleware that's called for every WenSocket message sent.
 *
 * @param connection Connection identifier
 * @param data The raw message data
 * @param to Recipients for `sockets.send`, null when responding from a handler
 */
export type OnMessageSent = (args: {
  connection: string;
  data: Buffer;
  to: string[] | null;
}) => void | Promise<void>;

/**
 * Middleware exported from the route module, or sockets/_middleware.ts.
 */
export type WebSocketMiddleware = {
  authenticate?: AuthenticateMethod | null;
  onError?: OnError | null;
  onMessageReceived?: OnMessageReceived | null;
  onMessageSent?: OnMessageSent | null;
};

/**
 * Exported from the route module.
 */
export type WebSocketExports = {
  config?: WebSocketConfig;
  default: WebSocketHandler;
} & WebSocketMiddleware;

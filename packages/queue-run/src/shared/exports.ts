/* eslint-disable no-unused-vars */
import { QueueMiddleware } from "../queue/exports";
import { RouteMiddleware } from "./../http/exports";
import { WebSocketMiddleware } from "./../ws/exports";

/**
 * The warmup function is called before any requests are handled.
 * The warmup funciton is only useful if you have provisioned concurrency.
 */
export type WarmupFunction = () => Promise<void> | void;

/**
 * Back-end configuration affecting all routes.
 */
export type BackendConfig = {
  /**
   * Memory size. Specified in megabytes (number) or string with the prefix MB
   * or GB.  Default is 128 MB..
   */
  memory?: number | `${number}${"mb" | "MB" | "gb" | "GB"}`;
};

/**
 * Any middleware (routes, queues, etc) can be specified here.
 *
 * This is a good place to locate all your logging middleware, and
 * authentication.
 */
export type SharedMiddleware = RouteMiddleware &
  QueueMiddleware &
  WebSocketMiddleware;

/**
 * Exported from index.ts.
 */
export type BackendExports = {
  warmup?: WarmupFunction;
  config?: BackendConfig;
} & SharedMiddleware;

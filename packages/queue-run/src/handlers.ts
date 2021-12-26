/* eslint-disable no-unused-vars */
import type { AbortSignal } from "node-abort-controller";
import { Middleware, OnError } from "../types/middleware";

export type RouteExports = {
  [key: string]: RequestHandler;
} & { config?: RouteConfig } & Middleware;

export type RequestHandler<
  JSON = JSONValue,
  Params = {
    [key: string]: string | string[];
  }
> = (
  request: Omit<Request, "json"> & { json: () => Promise<JSON> },
  metadata: RequestHandlerMetadata<Params>
) => Promise<Response | JSONValue> | Response | JSONValue;

export type RequestHandlerMetadata<
  Params = {
    [key: string]: string | string[];
  }
> = {
  // Parsed cookies.
  cookies: { [key: string]: string };
  // Parameters from the request URL, eg /project/:projectId will have the parameter `projectId`
  params: Params;
  // Notified when reached timeout, request aborted
  signal: AbortSignal;
  // If authenticted, the user ID and any other properties
  user?: { id: string; [key: string]: any };
};

export type RouteConfig = {
  // Only accepts requests with specific content type(s).  Default to '*/*' (any content types).
  accepts?: string[] | string;

  // True if this route supports CORS request (default: true).
  cors?: boolean;

  // Only accepts requests with specific HTTP method(s).  Default to '*' (all
  // methods).
  //
  // If you want to handle OPTIONS method, you need to set `cors` to false.
  methods?: HTTPMethod | HTTPMethod[];

  // Timeout for processing message in seconds. Defaults to 30.
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

type JSONObject = { [key: string]: JSONValue };
type JSONArray = JSONValue[];
export type JSONValue =
  | string
  | number
  | boolean
  | null
  | JSONArray
  | JSONObject;

export type QueueHandler<
  Payload = JSONValue | string | Buffer,
  Params = { [key: string]: string | string[] }
> = (
  payload: Payload,
  metadata: QueueHandlerMetadata<Params>
) => Promise<void> | void;

export type QueueExports = {
  default: QueueHandler;
  config?: QueueConfig;
  onError: OnError;
};

export type QueueHandlerMetadata<
  Params = { [key: string]: string | string[] }
> = {
  // Group ID (FIFO queue only)
  groupID?: string;
  // The queue name
  queueName: string;
  // Unique message ID
  messageID: string;
  // Parameters from the request URL, eg /project/:projectId will have the parameter `projectId`
  params: Params;
  // Number of times message was received
  receivedCount: number;
  // Timestamp when message was sent
  sentAt: Date;
  // Sequence number (FIFO queue only)
  sequenceNumber?: number;
  // Notified when reached timeout, message will be rejected
  signal: AbortSignal;
  // If authenticted, the user ID
  user?: { id: string };
};

// FIFO queue handler, groupID and sequence number always available.
export type FIFOQueueHandler<Payload, Exports> = QueueHandler<
  Payload,
  Exports
> & {
  metadata: QueueHandlerMetadata<Exports> & {
    groupID: string;
    sequenceNumber: number;
  };
};

export type QueueConfig = {
  // Timeout for processing message in seconds. Defaults to 30.
  timeout?: number;
};

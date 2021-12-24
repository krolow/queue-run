/* eslint-disable no-unused-vars */
import type { AbortSignal } from "node-abort-controller";
import type { Request, Response } from "node-fetch";

export type RequestHandler = (
  request: Request,
  metadata: RequestHandlerMetadata
) => Promise<Response | JSONValue> | Response | JSONValue;

export type RequestHandlerMetadata = {
  // Parameters from the request URL, eg /project/:projectId will have the parameter `projectId`
  params: { [key: string]: string };
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
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";

type JSONObject = { [key: string]: JSONValue };
type JSONArray = JSONValue[];
export type JSONValue =
  | string
  | number
  | boolean
  | null
  | JSONArray
  | JSONObject;

export type QueueHandler = (
  payload: JSONValue | string | Buffer,
  metadata: QueueHandlerMetadata
) => Promise<void> | void;

export type QueueHandlerMetadata = {
  // Group ID (FIFO queue only)
  groupID?: string;
  // The queue name
  queueName: string;
  // Unique message ID
  messageID: string;
  // Parameters from the request URL, eg /project/:projectId will have the parameter `projectId`
  params: { [key: string]: string };
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

export type QueueConfig = {
  // Timeout for processing message in seconds. Defaults to 30.
  timeout?: number;
};

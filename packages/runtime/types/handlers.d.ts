/* eslint-disable no-unused-vars */
import type { Request, Response } from "node-fetch";

export type RequestHandler = (
  request: Request,
  metadata: {
    // Parameters from the request URL, eg /project/:projectId will have the parameter `projectId`
    params: { [key: string]: string };
    // Notified when reached timeout, request aborted
    signal: AbortSignal;
    // If authenticted, the user ID and any other properties
    user?: { id: string; [key: string]: any };
  }
) => Promise<Response | JSONValue> | Response | JSONValue;

export type RouteConfig = {
  // Only accepts requests with specific content type
  accepts?: string[] | string;
  // Only accepts requests with specific HTTP method
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
type JSONValue = string | number | boolean | null | JSONArray | JSONObject;

export type QueueHandler = (
  payload: JSONObject | string,
  metadata: {
    // Group ID (FIFO queue only)
    groupID?: string;
    // The queue name
    queueName: string;
    // Unique message ID
    messageID: string;
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
  }
) => Promise<void> | void;

export type QueueConfig = {
  // Timeout for processing message in seconds. Defaults to 30.
  timeout?: number;
  // Expose this queue as HTTP POST request on this path (eg /user/:id/update)
  url?: string;
  // Only accept messages with specific content type
  accepts?: string[] | string;
};

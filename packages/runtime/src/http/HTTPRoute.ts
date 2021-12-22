import { MatchFunction } from "path-to-regexp";
import { QueueService } from "../queues/QueueService";

// Runtime definition for an HTTP route
export type HTTPRoute = {
  // Accepted content types, eg application/json, text/*, */*
  accepts: Set<string>;
  // True if QueueRun should handle CORS
  cors: boolean;
  // Filename of the module
  filename: string;
  // Match the request URL and return named parameters
  match: MatchFunction<{ [key: string]: string }>;
  // Allowed HTTP methods, eg ["GET", "POST"] or "*"
  methods: Set<string>;
  // Runtime definition for a queue if this route pushed to a queue
  queue?: QueueService;
  // Timeout in seconds
  timeout: number;
};

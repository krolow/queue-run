import fs from "fs/promises";
import path from "path";
import { match, MatchFunction } from "path-to-regexp";

// Runtime definition for an HTTP route
export type HTTPRoute = {
  // Accepted content types, eg application/json, text/*, */*
  accepts: Set<string>;
  // True if QueueRun should handle CORS
  cors: boolean;
  // Filename of the module
  filename: string;
  // Match the request URL and return named parameters
  match: MatchFunction<{ [key: string]: string | string[] }>;
  // Allowed HTTP methods, eg ["GET", "POST"] or "*"
  methods: Set<string>;
  // Timeout in seconds
  timeout: number;
};

// Runtime definition for a queue handler
export type QueueService = {
  // Filename of the module
  filename: string;
  // True if this is a FIFO queue
  isFifo: boolean;
  // The queue name (not fully qualified)
  queueName: string;
  // Timeout in seconds
  timeout: number;
};

// JSON structure of the manifest file
export type Manifest = {
  queues: Array<{
    filename: string;
    isFifo: boolean;
    queueName: string;
    timeout: number;
  }>;
  routes: Array<{
    accepts: string[];
    cors: boolean;
    filename: string;
    methods: string[];
    path: string;
    timeout: number;
  }>;
};

export async function loadManifest(dirname: string): Promise<{
  queues: Map<string, QueueService>;
  routes: Map<string, HTTPRoute>;
}> {
  const manifest = JSON.parse(
    await fs.readFile(path.resolve(dirname, "manifest.json"), "utf8")
  ) as Manifest;

  const queues = new Map(
    manifest.queues.map((queue) => [queue.queueName, queue])
  );

  const routes = new Map(
    manifest.routes.map((route) => [
      route.path,
      {
        accepts: new Set(route.accepts ?? "*/*"),
        cors: route.cors ?? true,
        methods: new Set(route.methods ?? "*"),
        filename: route.filename,
        match: match<{ [key: string]: string | string[] }>(route.path),
        timeout: route.timeout ?? 10,
      },
    ])
  );
  return { queues, routes };
}

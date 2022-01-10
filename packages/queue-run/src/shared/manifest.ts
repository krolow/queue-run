import fs from "fs/promises";
import path from "path";
import { match, MatchFunction } from "path-to-regexp";

export type HTTPRoute = {
  accepts: Set<string>;
  cors: boolean;
  filename: string;
  match: MatchFunction<{ [key: string]: string | string[] }>;
  methods: Set<string>;
  timeout: number;
};

export type QueueService = {
  filename: string;
  isFifo: boolean;
  queueName: string;
  timeout: number;
};

// JSON structure of the manifest file
//
// This is loaded and converted into HTTPRoute, QueueService, etc
export type Manifest = {
  queues: Array<{
    filename: string;
    isFifo: boolean;
    original: string;
    queueName: string;
    timeout: number;
  }>;
  routes: Array<{
    accepts: string[];
    cors: boolean;
    filename: string;
    methods: string[];
    original: string;
    path: string;
    timeout: number;
  }>;
};

export async function loadManifest(dirname = process.cwd()): Promise<{
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

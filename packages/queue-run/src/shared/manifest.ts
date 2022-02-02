import fs from "node:fs/promises";
import path from "node:path";
import { match, MatchFunction } from "path-to-regexp";

export type BackendLimits = {
  memory: number; // Memory size in MB
  timeout: number; // Timeout in seconds
};

export type HTTPRoute = {
  accepts: Set<string>;
  cors: boolean;
  filename: string;
  match: MatchFunction<{ [key: string]: string | string[] }>;
  methods: Set<string>;
  original: string;
  timeout: number;
};

export type QueueService = {
  filename: string;
  isFifo: boolean;
  queueName: string;
  original: string;
  timeout: number;
};

export type ScheduledJob = {
  cron: string;
  filename: string;
  name: string;
  original: string;
  timeout: number;
};

export type WebSocketRoute = {
  filename: string;
  original: string;
  timeout: number;
};

// JSON structure of the manifest file
//
// This is loaded and converted into HTTPRoute, QueueService, etc
export type Manifest = {
  limits: {
    memory: number;
    timeout: number;
  };
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
  schedules: Array<{
    cron: string;
    filename: string;
    name: string;
    original: string;
    timeout: number;
  }>;
  socket: Array<{
    path: string;
    filename: string;
    original: string;
    timeout: number;
  }>;
};

export async function loadManifest(dirname = process.cwd()): Promise<{
  limits: BackendLimits;
  queues: Map<string, QueueService>;
  routes: Map<string, HTTPRoute>;
  schedules: Map<string, ScheduledJob>;
  socket: Map<string, WebSocketRoute>;
}> {
  const manifest = JSON.parse(
    await fs.readFile(path.resolve(dirname, "manifest.json"), "utf-8")
  ) as Manifest;

  const { limits } = manifest;

  const queues = new Map(
    manifest.queues.map((queue) => [
      queue.queueName,
      {
        filename: queue.filename,
        isFifo: queue.isFifo,
        original: queue.original,
        queueName: queue.queueName,
        timeout: queue.timeout,
      },
    ])
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
        original: route.original,
        timeout: route.timeout,
      },
    ])
  );

  const socket = new Map(
    manifest.socket.map((socket) => [
      socket.path,
      {
        filename: socket.filename,
        original: socket.original,
        timeout: socket.timeout,
      },
    ])
  );

  const schedules = new Map(
    manifest.schedules.map((schedule) => [
      schedule.cron,
      {
        cron: schedule.cron,
        filename: schedule.filename,
        name: schedule.name,
        original: schedule.original,
        timeout: schedule.timeout,
      },
    ])
  );

  return { limits, queues, routes, schedules, socket };
}

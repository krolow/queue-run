import fs from "node:fs/promises";
import path from "node:path";
import { match, MatchFunction } from "path-to-regexp";
import type { BackendConfig } from "./exports.js";

export type BackendLimits = {
  memory: number; // Memory size in MB
  timeout: number; // Timeout in seconds
};

export type HTTPRoute = {
  accepts: Set<string>;
  cors: boolean;
  filename: string;
  match: MatchFunction<{ [key: string]: string | string[] }>;
  path: string;
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
  path: string;
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
    filename: string;
    original: string;
    path: string;
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
        path: route.path,
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
        path: socket.path,
        timeout: socket.timeout,
      },
    ])
  );

  const schedules = new Map(
    manifest.schedules.map((schedule) => [
      schedule.name,
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

export async function writeManifest({
  config,
  queues,
  routes,
  schedules,
  socket,
}: {
  config: BackendConfig | undefined;
  queues: Manifest["queues"];
  routes: Manifest["routes"];
  schedules: Manifest["schedules"];
  socket: Manifest["socket"];
}) {
  const limits = {
    memory: getMemory(config),
    timeout: getTimeout({ queues, routes, schedules, socket }),
  };

  const manifest: Manifest = {
    limits,
    queues,
    routes,
    schedules,
    socket,
  };
  await fs.writeFile("manifest.json", JSON.stringify(manifest), "utf-8");
  return manifest;
}

function getTimeout({
  queues,
  routes,
  schedules,
  socket,
}: {
  queues: Manifest["queues"];
  routes: Manifest["routes"];
  schedules: Manifest["schedules"];
  socket: Manifest["socket"];
}) {
  return Math.max(
    ...Array.from(queues.values()).map((queue) => queue.timeout),
    ...Array.from(routes.values()).map((route) => route.timeout),
    ...Array.from(socket.values()).map((socket) => socket.timeout),
    ...Array.from(schedules.values()).map((schedule) => schedule.timeout)
  );
}

function getMemory(config: BackendConfig | undefined) {
  const memory = config?.memory ?? 128;
  if (typeof memory === "number") return memory;
  const match = memory.trim().match(/^(\d+)\s*([MG]B?)$/i);
  if (!match) throw new Error(`Invalid memory limit: ${memory}`);
  const [, amount, unit] = match;
  return unit === "GB" || unit === "G"
    ? parseFloat(amount!) * 1000
    : parseInt(amount!);
}

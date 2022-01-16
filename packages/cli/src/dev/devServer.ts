import { Sema } from "async-sema";
import chalk from "chalk";
import * as chokidar from "chokidar";
import dotenv from "dotenv";
import fs from "fs/promises";
import ms from "ms";
import cluster from "node:cluster";
import crypto from "node:crypto";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import process from "node:process";
import { URL } from "node:url";
import {
  authenticateWebSocket,
  handleHTTPRequest,
  handleQueuedJob,
  handleWebSocketMessage,
  LocalStorage,
  Request,
  Response,
  warmup,
} from "queue-run";
import { buildProject } from "queue-run-builder";
import invariant from "tiny-invariant";
import { WebSocket, WebSocketServer } from "ws";
import {
  DevLocalStorage,
  onWebSocketAccepted,
  onWebSocketClosed,
} from "./state.js";

// Make sure we're not building the project in parallel.
const blockOnBuild = new Sema(1);

const sourceDir = process.cwd();
const buildDir = path.resolve(".queue-run");

export default async function devServer({ port }: { port: number }) {
  cluster.setupMaster({
    exec: new URL(import.meta.url).pathname,
  });

  console.info(
    chalk.bold.green("👋 Dev server listening on:\n   %s\n   %s"),
    `http://localhost:${port}`,
    `ws://localhost:${port + 1}`
  );

  await newWorker(port);

  console.info(chalk.gray("   Watching for changes (Crtl+R to reload) …"));
  chokidar
    .watch(sourceDir, {
      ignored: ["**/node_modules/**", buildDir],
      ignoreInitial: true,
    })
    .on("all", (event, filename) => onFileChange(event, filename, port));

  process.stdin.on("data", (data) => {
    const key = data[0];
    if (key === 3) process.exit(0);
    // Ctrl+C
    else if (key === 18) newWorker(port);
    // Ctrl+R
    else if (key === 13) process.stdout.write("\n");
    else if (key) {
      if (key < 32)
        console.info(chalk.gray("   Ctrl+C to exit, Crtl+R to reload"));
      process.stdout.write(String.fromCharCode(key));
    }
  });
  await new Promise(() => {});
}

async function newWorker(port: number) {
  const token = await blockOnBuild.acquire();

  for (const worker of Object.values(cluster.workers!)) {
    invariant(worker);
    worker.disconnect();
    const timeout = setTimeout(() => worker.kill(), 1000);
    worker.on("disconnect", () => clearTimeout(timeout));
  }

  const fromFile = await fs.readFile(`.env.local`, "utf-8").then(
    (file) => dotenv.parse(file),
    () => undefined
  );

  const worker = cluster.fork({
    ...fromFile,
    NODE_ENV: "development",
    PORT: port,
    QUEUE_RUN_ENV: "development",
    QUEUE_RUN_INDENT: "2",
    QUEUE_RUN_URL: `http://localhost:${port}`,
    QUEUE_RUN_WS: `ws://localhost:${port + 1}`,
  });

  // For some reason we need to reset this every time we fork
  process.stdin.setRawMode(true);
  process.stdin.resume();

  await new Promise((resolve) => {
    worker
      .on("message", (message) => {
        if (message === "ready") resolve(undefined);
      })
      .on("exit", () => resolve(undefined));
  });
  blockOnBuild.release(token);
}

function onFileChange(event: string, filename: string, port: number) {
  if (!(event === "add" || event === "change")) return;
  if (!/\.(tsx?|jsx?|json)$/.test(filename)) return;

  console.info(
    chalk.gray(`   %s "%s" reloading …`),
    event === "add" ? "New file" : "Changed",
    filename
  );
  newWorker(port);
}

if (cluster.isWorker) {
  const port = Number(process.env.PORT);

  const ready = (async () => {
    await buildProject({ buildDir, sourceDir });
    process.send!("ready");

    process.chdir(buildDir);
    await warmup(new DevLocalStorage(port));
  })();

  const http = createServer(async (req, res) => {
    await ready;
    onRequest(req, res, () => new DevLocalStorage(port));
  }).listen(port);
  const ws = new WebSocketServer({ port: port + 1 }).on(
    "connection",
    async (ws, req) => {
      await ready;
      onConnection(ws, req, () => new DevLocalStorage(port));
    }
  );

  // Make sure we exit if buildProject fails
  try {
    await ready;
  } catch (error) {
    console.error("💥 Build failed!", error);
    process.exit(1);
  }

  process.on("disconnect", function () {
    http.close();
    ws.close();
  });
}

async function onRequest(
  req: IncomingMessage,
  res: ServerResponse,
  newLocalStorage: () => LocalStorage
) {
  if (req.url?.startsWith("/$queues/"))
    return queueJob(req, res, newLocalStorage);

  const method = req.method?.toLocaleUpperCase() ?? "GET";
  const headers = Object.fromEntries(
    Object.entries(req.headers).map(([name, value]) => [name, String(value)])
  );
  const url = new URL(req.url ?? "/", `http://${headers.host}`);
  const body = await getRequestBody(req);
  const request = new Request(url.href, {
    method,
    headers,
    body,
  });
  const response = await handleHTTPRequest({
    newLocalStorage,
    request,
    requestId: crypto.randomBytes(4).toString("hex"),
  });
  res.writeHead(response.status, Array.from(response.headers.entries()));
  const buffer = await response.arrayBuffer();
  res.end(Buffer.from(buffer));
}

async function getRequestBody(req: IncomingMessage): Promise<Buffer | null> {
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  if (!hasBody) return null;
  let data: Buffer[] = [];
  for await (const chunk of req) data.push(chunk);
  return Buffer.concat(data);
}

async function queueJob(
  req: IncomingMessage,
  res: ServerResponse,
  newLocalStorage: () => LocalStorage
) {
  if (req.method !== "POST") {
    res.writeHead(405, "Method not allowed").end();
    return;
  }

  let payload;
  let data: Buffer[] = [];
  for await (const chunk of req) data.push(chunk);
  payload = Buffer.concat(data).toString("utf-8");
  try {
    payload = JSON.parse(payload);
  } catch {
    // Ignore
  }

  const [queueName, groupId] = req.url!.split("/").slice(2);
  invariant(queueName, "Queue name is required");

  try {
    await handleQueuedJob({
      metadata: {
        queueName,
        groupId,
        jobId: crypto.randomBytes(4).toString("hex"),
        params: {},
        receivedCount: 1,
        queuedAt: new Date(),
        sequenceNumber: groupId ? 1 : undefined,
        user: null,
      },
      newLocalStorage,
      payload,
      queueName,
      remainingTime: ms("30s"),
    });
    res.writeHead(200, "OK").end();
  } catch (error) {
    console.error("💥 Queue job failed!", error);
    res.writeHead(500, "Internal Server Error").end();
  }
}

async function onConnection(
  socket: WebSocket,
  req: IncomingMessage,
  newLocalStorage: () => LocalStorage
) {
  let userId: string | null;
  try {
    userId = await authenticate(req, newLocalStorage);
  } catch {
    socket.send(JSON.stringify({ error: "Unauthorized" }));
    socket.terminate();
    return;
  }
  const connection = onWebSocketAccepted({
    connection: String(req.headers["sec-websocket-key"]),
    newLocalStorage,
    socket,
    userId,
  });

  socket.on("message", async (rawData) => {
    const data =
      rawData instanceof ArrayBuffer
        ? Buffer.from(rawData)
        : Array.isArray(rawData)
        ? Buffer.concat(rawData)
        : rawData;
    const response = await handleWebSocketMessage({
      connection,
      data,
      newLocalStorage,
      requestId: crypto.randomBytes(4).toString("hex"),
      userId,
    });
    if (response) socket.send(response);
  });
  socket.on("close", () =>
    onWebSocketClosed({
      connection,
      newLocalStorage,
    })
  );
}

async function authenticate(
  req: IncomingMessage,
  newLocalStorage: () => LocalStorage
): Promise<string | null> {
  const request = new Request(
    new URL(req.url ?? "/", `http://${req.headers.host}`).href,
    {
      method: req.method ?? "GET",
      headers: Object.fromEntries(
        Object.entries(req.headers).map(([name, value]) => [
          name,
          String(value),
        ])
      ),
    }
  );
  try {
    const user = await authenticateWebSocket({
      request,
      newLocalStorage,
    });
    return user?.id ?? null;
  } catch (error) {
    if (!(error instanceof Response))
      console.error("💥 Authentication failed!", error);
    throw error;
  }
}

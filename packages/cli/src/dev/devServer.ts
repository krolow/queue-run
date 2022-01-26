import { Sema } from "async-sema";
import chalk from "chalk";
import * as chokidar from "chokidar";
import dotenv from "dotenv";
import fs from "fs/promises";
import ms from "ms";
import cluster from "node:cluster";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import process from "node:process";
import { URL } from "node:url";
import {
  authenticateWebSocket,
  handleHTTPRequest,
  handleQueuedJob,
  handleWebSocketMessage,
  Headers,
  LocalStorage,
  warmup,
} from "queue-run";
import { buildProject } from "queue-run-builder";
import { Duplex } from "stream";
import invariant from "tiny-invariant";
import { WebSocket, WebSocketServer } from "ws";
import {
  DevLocalStorage,
  getUser as getUserId,
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
    `ws://localhost:${port}`
  );

  await newWorker(port);

  console.info(chalk.gray("   Watching for changes (Crtl+R to reload) …"));
  chokidar
    .watch(sourceDir, {
      ignored: ["**/node_modules/**", buildDir, "**/.*/**"],
      ignoreInitial: true,
    })
    .on("all", (event, filename) => onFileChange(event, filename, port));

  process.stdin.on("data", (data) => {
    const key = data[0]!;
    switch (key) {
      case 3: {
        // Ctrl+C
        process.exit(0);
        break;
      }
      case 12: {
        // Ctrl+L
        // ANSI code to clear terminal
        process.stdout.write("\u001B[2J\u001B[0;0f");
        break;
      }
      case 18: {
        // Ctrl+R
        newWorker(port);
        break;
      }
      case 13: {
        // Enter
        process.stdout.write("\n");
        break;
      }
      default: {
        if (key < 32)
          console.info(
            "   %s",
            chalk.gray(
              [
                "Ctrl+C to exit",
                "Ctrl+L to clear screen",
                "Ctrl+R to reload",
              ].join(", ")
            )
          );
        process.stdout.write(String.fromCharCode(key));
      }
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
    QUEUE_RUN_WS: `ws://localhost:${port}`,
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

  const ws = new WebSocketServer({ noServer: true });
  const http = createServer()
    .on("request", async (req, res) => {
      await ready;
      onRequest(req, res, () => new DevLocalStorage(port));
    })
    .on("upgrade", async (req, socket, head) => {
      await ready;
      onUpgrade(req, socket, head, ws, () => new DevLocalStorage(port));
    })
    .listen(port);

  process.on("disconnect", function () {
    http.close();
    ws.close();
  });

  // Make sure we exit if buildProject fails
  ready.catch((error) => {
    console.error("💥 Build failed!", error);
    process.exit(1);
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
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const headers = new Headers(
    Object.fromEntries(
      Object.entries(req.headers).map(([name, value]) => [name, String(value)])
    )
  );
  headers.set("X-Forwarded-For", req.socket?.remoteAddress ?? "unknown");
  const body = await getRequestBody(req);
  const request = new Request(url.href, {
    method,
    headers,
    body,
  });

  const response = await handleHTTPRequest({
    newLocalStorage,
    request,
    requestId: crypto.randomUUID(),
  });
  const resHeaders: Record<string, string> = {};
  response.headers.forEach((value, name) => (resHeaders[name] = value));
  res.writeHead(response.status, resHeaders);
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
        jobId: crypto.randomUUID(),
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

async function onUpgrade(
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  wss: WebSocketServer,
  newLocalStorage: () => LocalStorage
) {
  try {
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

    await authenticateWebSocket({
      request,
      requestId: crypto.randomUUID(),
      newLocalStorage,
    });
    const connection = req.headers["sec-websocket-key"]!;

    wss.handleUpgrade(req, socket, head, (socket) =>
      onConnection({
        connection,
        newLocalStorage,
        socket,
      })
    );
  } catch (error) {
    console.log({ error });
    if (error instanceof Response) {
      console.info("   Authentication rejected: %d", error.status);
      socket.write(`HTTP/1.1 ${error.status} ${await error.text()}\r\n\r\n`);
    } else {
      console.error("💥 Authentication failed!");
      socket.write("HTTP/1.1 500 Internal Server Error\r\n\r\n");
    }
    socket.destroy();
  }
}

async function onConnection({
  connection,
  newLocalStorage,
  socket,
}: {
  connection: string;
  newLocalStorage: () => LocalStorage;
  socket: WebSocket;
}) {
  onWebSocketAccepted({ connection, socket });

  socket.on("message", async (rawData) => {
    const data =
      rawData instanceof ArrayBuffer
        ? Buffer.from(rawData)
        : Array.isArray(rawData)
        ? Buffer.concat(rawData)
        : rawData;
    try {
      await handleWebSocketMessage({
        connection,
        data,
        newLocalStorage,
        requestId: crypto.randomUUID(),
        userId: getUserId(connection),
      });
    } catch (error) {
      socket.send(JSON.stringify({ error: String(error) }));
    }
  });
  socket.on("close", () =>
    onWebSocketClosed({
      connection,
      newLocalStorage,
    })
  );
}

import { Sema } from "async-sema";
import chalk from "chalk";
import * as chokidar from "chokidar";
import cluster from "cluster";
import { createServer, IncomingMessage, ServerResponse } from "http";
import path from "path";
import process from "process";
import {
  handleHTTPRequest,
  handleWebSocketMessage,
  LocalStorage,
  Request,
  warmup,
} from "queue-run";
import { buildProject } from "queue-run-builder";
import { URL } from "url";
import { WebSocket, WebSocketServer } from "ws";
import envVariables from "./envVariables.js";
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
  envVariables(port);

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

  for (const worker of Object.values(cluster.workers!)) worker!.kill();
  const worker = cluster.fork({ PORT: port });
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

  createServer(async (req, res) => {
    await ready;
    onRequest(req, res, () => new DevLocalStorage(port));
  }).listen(port);
  new WebSocketServer({ port: port + 1 }).on("connection", async (ws, req) => {
    await ready;
    onConnection(ws, req, () => new DevLocalStorage(port));
  });

  // Make sure we exit if buildProject fails
  try {
    await ready;
  } catch (error) {
    console.error(chalk.bold.red("💥 Build failed!"), error);
    process.exit(1);
  }
}

async function onRequest(
  req: IncomingMessage,
  res: ServerResponse,
  newLocalStorage: () => LocalStorage
) {
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
  const response = await handleHTTPRequest(request, newLocalStorage);
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

async function onConnection(
  socket: WebSocket,
  req: IncomingMessage,
  newLocalStorage: () => LocalStorage
) {
  // TODO: authentication
  const userId = null;
  const connection = onWebSocketAccepted(socket, userId);

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
      userId,
    });
    if (response) socket.send(response);
  });
  socket.on("close", () => onWebSocketClosed(connection));
}

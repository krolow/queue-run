import { Sema } from "async-sema";
import chalk from "chalk";
import * as chokidar from "chokidar";
import cluster from "cluster";
import { createServer, IncomingMessage, ServerResponse } from "http";
import path from "path";
import process from "process";
import {
  handleHTTPRequest,
  LocalStorage,
  Request,
  sockets,
  withLocalStorage,
} from "queue-run";
import { buildProject } from "queue-run-builder";
import { URL } from "url";
import { WebSocket, WebSocketServer } from "ws";
import DevLocalStorage from "./DevLocalStorage.js";
import envVariables from "./envVariables.js";

const semaphore = new Sema(1);

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
      ignored: ["**/node_modules/**", buildDir, "*.d.ts", ".*"],
      ignoreInitial: true,
    })
    .on("all", (event, filename) => onFileChange(event, filename, port));

  process.stdin.on("data", (data) => {
    const key = data[0];
    if (key === 3) process.exit(0); // Ctrl+C
    if (key === 18) newWorker(port); // Ctrl+R
  });
  await new Promise(() => {});
}

async function newWorker(port: number) {
  const token = await semaphore.acquire();

  for (const worker of Object.values(cluster.workers!)) worker!.kill();
  const worker = cluster.fork({ PORT: port });
  process.stdin.setRawMode(true);
  process.stdin.resume();

  await new Promise((resolve) => {
    worker
      .on("message", (message) => {
        if (message === "ready") resolve(undefined);
      })
      .on("exit", () => resolve(undefined));
  });
  semaphore.release(token);
}

function onFileChange(event: string, filename: string, port: number) {
  if (event === "add" || event === "change") {
    console.info(
      chalk.gray(`   %s "%s" reloading …`),
      event === "add" ? "New file" : "Changed",
      filename
    );
    newWorker(port);
  }
}

if (cluster.isWorker) {
  const port = Number(process.env.PORT);
  await buildProject({ buildDir, sourceDir });
  process.send!("ready");
  process.chdir(buildDir);

  createServer((req, res) =>
    onRequest(req, res, () => new DevLocalStorage(port))
  ).listen(port);

  new WebSocketServer({ port: port + 1 }).on("connection", (ws, req) =>
    onConnection(ws, req, () => new DevLocalStorage(port))
  );
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
  ws: WebSocket,
  req: IncomingMessage,
  newLocalStorage: () => LocalStorage
) {
  const socketID = "";
  localStorage.sockets.set(socketID, ws);

  const userID = String(req.headers.authentication);
  if (userID) localStorage.onWebSocketAccepted({ userID, socketID });

  ws.on("message", (message) => {
    localStorage.user = { id: userID };
    withLocalStorage(newLocalStorage(), () => {
      sockets.send("Back at you");
    });
  });
  ws.on("close", function () {
    localStorage.onWebSocketClosed(socketID);
    localStorage.sockets.delete(socketID);
  });
}

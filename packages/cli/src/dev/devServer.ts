import { Sema } from "async-sema";
import chalk from "chalk";
import chokidar from "chokidar";
import fs from "fs/promises";
import { createServer, IncomingMessage, ServerResponse } from "http";
import path from "path";
import { handleHTTPRequest, LocalStorage, Request } from "queue-run";
import { buildProject } from "queue-run-builder";
import { URL } from "url";
import { WebSocket, WebSocketServer } from "ws";
import DevLocalStorage from "./DevLocalStorage";
import envVariables from "./envVariables";

const semaphore = new Sema(1);

const sourceDir = process.cwd();
const buildDir = path.resolve(".queue-run");

export default async function devServer({ port }: { port: number }) {
  envVariables(port);
  await fs.mkdir(buildDir, { recursive: true });
  const localStorage = new DevLocalStorage(port);

  const server = createServer((req, res) => onRequest(req, res, localStorage));
  server.listen(port, () => onListening(port));

  const wss = new WebSocketServer({ port: port + 1 });
  wss.on("connection", (ws, req) => onConnection(ws, req, localStorage));

  await new Promise((resolve, reject) => {
    server.on("close", resolve).on("error", reject);
    wss.on("close", resolve).on("error", reject);
  });
}

async function onListening(port: number) {
  const token = await semaphore.acquire();
  try {
    await buildProject({ buildDir, sourceDir });

    console.info(
      chalk.bold.green("👋 Dev server listening on:\n   %s\n   %s"),
      `http://localhost:${port}`,
      `ws://localhost:${port + 1}`
    );

    console.info(chalk.gray("   Watching for changes …"));
    chokidar
      .watch(sourceDir, {
        ignored: ["**/node_modules/**", buildDir, "*.d.ts", ".*"],
        ignoreInitial: true,
      })
      .on("all", onReload);
  } catch (error) {
    if (error instanceof Error) console.error(error.stack);
    process.exit(1);
  } finally {
    semaphore.release(token);
  }
}

async function onRequest(
  req: IncomingMessage,
  res: ServerResponse,
  localStorage: LocalStorage
) {
  const token = await semaphore.acquire();
  process.chdir(buildDir);
  try {
    const method = req.method?.toLocaleUpperCase() ?? "GET";
    const headers = Object.fromEntries(
      Object.entries(req.headers).map(([name, value]) => [name, String(value)])
    );
    const url = new URL(req.url ?? "/", `http://${headers.host}`);
    const body = await getRequestBody(req);
    const request = new Request(url, {
      method,
      headers,
      body,
    });
    const response = await handleHTTPRequest(request, () => localStorage);
    res.writeHead(response.status, Array.from(response.headers.entries()));
    res.end(response.body, "base64");
  } finally {
    process.chdir(sourceDir);
    semaphore.release(token);
  }
}

async function onConnection(
  ws: WebSocket,
  req: IncomingMessage,
  localStorage: DevLocalStorage
) {
  const socketID = "";
  localStorage.sockets.set(socketID, ws);

  const userID = String(req.headers.authentication);
  if (userID) localStorage.onWebSocketAccepted({ userID, socketID });

  ws.on("message", (message) => console.log("message %o", message.toString()));
  ws.on("close", function () {
    localStorage.onWebSocketClosed(socketID);
    localStorage.sockets.delete(socketID);
  });
}

async function getRequestBody(req: IncomingMessage) {
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  if (!hasBody) return undefined;
  let data: Buffer[] = [];
  for await (const chunk of req) data.push(chunk);
  return Buffer.concat(data).toString();
}

async function onReload(event: string, filename: string) {
  if (event === "add" || event === "change") {
    const token = await semaphore.acquire();
    try {
      console.info(
        chalk.gray(`   %s %s …`),
        event === "add" ? "New file" : "Changed",
        filename
      );
      await buildProject({ buildDir, sourceDir });
      const filenames = Object.keys(require.cache).filter((filename) =>
        filename.startsWith(sourceDir)
      );
      for (const filename of filenames) delete require.cache[filename];
    } finally {
      semaphore.release(token);
    }
  }
}

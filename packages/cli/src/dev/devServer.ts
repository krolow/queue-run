import { Sema } from "async-sema";
import chalk from "chalk";
import chokidar from "chokidar";
import fs from "fs/promises";
import { createServer, IncomingMessage, ServerResponse } from "http";
import path from "path";
import { handleHTTPRequest, LocalStorage, Request } from "queue-run";
import { buildProject } from "queue-run-builder";
import { URL } from "url";
import envVariables from "./envVariables";
import { newLocalStorage } from "./newLocalStorage";

const semaphore = new Sema(1);

const sourceDir = process.cwd();
const buildDir = path.resolve(".queue-run");

export default async function devServer({ port }: { port: number }) {
  envVariables(port);

  await fs.mkdir(buildDir, { recursive: true });
  const server = createServer((req, res) =>
    onRequest(req, res, newLocalStorage(port))
  );
  server.listen(port, () => onListening(port));
  await new Promise((resolve, reject) =>
    server.on("close", resolve).on("error", reject)
  );
}

async function onListening(port: number) {
  try {
    await semaphore.acquire();
    await buildProject({ buildDir, sourceDir });

    console.info(
      chalk.bold.green("👋 Dev server listening on http://localhost:%d"),
      port
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
    semaphore.release();
  }
}

async function onRequest(
  req: IncomingMessage,
  res: ServerResponse,
  localStorage: LocalStorage
) {
  await semaphore.acquire();
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
    semaphore.release();
  }
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
    await semaphore.acquire();
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
      semaphore.release();
    }
  }
}

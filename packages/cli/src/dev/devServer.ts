import { moduleLoader } from "@queue-run/builder";
import chalk from "chalk";
import { createServer, IncomingMessage, ServerResponse } from "http";
import ora from "ora";
import { handleHTTPRequest } from "queue-run";
import { URL } from "url";
import envVariables from "./envVariables";
import { newLocalStorage } from "./newLocalStorage";

export default async function devServer({ port }: { port: number }) {
  envVariables(port);
  await moduleLoader({ dirname: process.cwd(), onReload });

  const server = createServer(onRequest);
  server.listen(port, () => onListening(port));
  await new Promise((resolve, reject) =>
    server.on("close", resolve).on("error", reject)
  );
}

async function onListening(port: number) {
  const spinner = ora("Reviewing services").start();
  try {
    // await loadServices(process.cwd());
    spinner.stop();

    console.info(
      chalk.bold.green("👋 Dev server listening on http://localhost:%d"),
      port
    );

    console.info(chalk.gray("   Watching for changes …"));
  } catch (error) {
    spinner.fail(String(error));
    process.exit(1);
  }
}

async function onRequest(req: IncomingMessage, res: ServerResponse) {
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
  const response = await handleHTTPRequest(request, newLocalStorage);
  console.info("%s %s => %s", method, req.url, response.status);
  res.writeHead(
    response.status,
    Object.fromEntries(response.headers.entries())
  );
  res.end(response.body, "base64");
}

async function getRequestBody(req: IncomingMessage) {
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  if (!hasBody) return undefined;
  let data: Buffer[] = [];
  for await (const chunk of req) data.push(chunk);
  return Buffer.concat(data).toString("base64");
}

async function onReload(filename: string) {
  const spinner = ora(`File ${filename} changed, reloading`).start();
  try {
    await Promise.all([
      // loadServices(process.cwd()),
      new Promise((resolve) => setTimeout(resolve, 500)),
    ]);
    spinner.succeed(`File ${filename} changed, reloaded`);
  } catch (error) {
    spinner.fail(String(error));
  }
}

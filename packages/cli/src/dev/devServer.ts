import { loadTopology, moduleLoader, showTopology } from "@queue-run/builder";
import { handler } from "@queue-run/runtime";
import chalk from "chalk";
import crypto from "crypto";
import { createServer } from "http";
import ora from "ora";
import { URL } from "url";

export default async function devServer({ port }: { port: number }) {
  const server = createServer(async function (req, res) {
    const method = req.method?.toLocaleUpperCase() ?? "GET";
    const headers = Object.fromEntries(
      Object.entries(req.headers).map(([name, value]) => [name, String(value)])
    );
    const url = new URL(req.url ?? "/", `http://${headers.host}`);
    let data: Buffer[] = [];
    for await (const chunk of req) data.push(chunk);
    const body = Buffer.concat(data).toString("base64");

    const lambdaEvent = {
      method,
      url: url.href,
      headers,
      body,
    };
    const functionName = headers.host!.split(":")[0];
    const timeout = Date.now() + 10 * 1000;
    const lambdaContext = {
      awsRequestId: crypto.randomBytes(8).toString("hex"),
      callbackWaitsForEmptyEventLoop: false,
      functionName,
      functionVersion: "0",
      getRemainingTimeInMillis: () => timeout - Date.now(),
      invokedFunctionArn: `arn:aws:lambda:localhost:12345:function:${functionName}:${functionName}-dev`,
      logGroupName: functionName,
      memoryLimitInMB: "1024",
    };

    const response = await handler(lambdaEvent, lambdaContext);
    if (response) {
      console.info("%s %s => %s", method, req.url, response.statusCode);
      res.writeHead(response.statusCode, response.headers);
      res.end(Buffer.from(response.body, "base64"));
    } else {
      console.info("%s => 500", req.url);
      res.writeHead(500).end("Internal Server Error");
    }
  });

  await moduleLoader({ dirname: process.cwd(), onReload });

  server.listen(port, async () => {
    const spinner = ora("Reviewing endpoints").start();
    const topology = await loadTopology(process.cwd());
    spinner.stop();

    console.info(
      chalk.bold.green("👋 Dev server listening on http://localhost:%d"),
      port
    );

    showTopology(topology);
    console.info(chalk.gray("   Watching for changes …"));
  });

  await new Promise((resolve, reject) =>
    server.on("close", resolve).on("error", reject)
  );
}

async function onReload(filename: string) {
  const spinner = ora(`File ${filename} changed, reloading`).start();
  await Promise.all([
    loadTopology(process.cwd()),
    new Promise((resolve) => setTimeout(resolve, 500)),
  ]);
  spinner.succeed(`File ${filename} changed, reloaded`);
}

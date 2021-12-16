import { handler, loadModuleSymbol } from "@queue-run/runtime";
import crypto from "crypto";
import { createServer } from "http";
import { URL } from "url";
import loadModule from "./loadModule";

declare var global: {
  [loadModuleSymbol]: (filename: string) => Promise<any>;
};

export default async function devServer({ port }: { port: number }) {
  global[loadModuleSymbol] = async (filename) => loadModule(filename).exports;

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
  server.listen(port, () => {
    console.info("👋 Dev server listening on http://localhost:%d", port);
  });
  await new Promise((resolve, reject) =>
    server.on("close", resolve).on("error", reject)
  );
}

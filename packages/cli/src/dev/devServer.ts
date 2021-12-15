import { handler } from "@queue-run/runtime";
import { createServer } from "http";
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
    const body = Buffer.concat(data).toString();

    const response = await handler({ method, url: url.href, headers, body });
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

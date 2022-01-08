import { URL } from "url";
import { Request, Response } from "./fetch.js";

export async function logResponse(request: Request, response: Response) {
  console.log(
    '"%s %s" %s %d "%s" "%s"',
    request.method,
    new URL(request.url).pathname,
    response.status,
    (await response.clone().arrayBuffer()).byteLength,
    request.headers.get("Referer") ?? "",
    request.headers.get("User-Agent") ?? ""
  );
}

import { URL } from "node:url";
import { Request, Response } from "./fetch.js";

/**
 * Default middleware for HTTP routes logs the response.
 *
 * @param request HTTP request object
 * @param response HTTP response object
 */
export async function logResponse(request: Request, response: Response) {
  console.info(
    '[%s] "%s %s" %s %d "%s" "%s"',
    request.headers.get("X-Forwarded-For"),
    request.method,
    new URL(request.url).pathname,
    response.status,
    (await response.clone().arrayBuffer()).byteLength,
    request.headers.get("Referer") ?? "",
    request.headers.get("User-Agent") ?? ""
  );
}

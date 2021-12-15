import { Headers, Request, Response } from "node-fetch";
import type {
  BackendLambdaRequest,
  BackendLambdaResponse,
} from "./../../gateway/src/types";

export async function asFetchRequest(
  event: BackendLambdaRequest,
  handler: (request: Request) => Promise<Response | string | object>
): Promise<BackendLambdaResponse> {
  try {
    const response = await handler(toFetchRequest(event));

    if (response instanceof Response) return fromFetchResponse(response);
    if (typeof response === "string" || response instanceof String) {
      return fromFetchResponse(
        new Response(String(response), {
          headers: { "Content-Type": "text/plain" },
        })
      );
    }
    if (response instanceof Buffer) {
      return fromFetchResponse(
        new Response(response, { headers: { "Content-Type": "text/plain" } })
      );
    }
    if (response === null || response === undefined) {
      console.error(
        "HTTP request returned null or undefined. If this was intentional, use this instead: return new Response(null, { status: 204 })"
      );
      return fromFetchResponse(new Response(undefined, { status: 204 }));
    }
    return fromFetchResponse(
      new Response(JSON.stringify(response), {
        headers: { "Content-Type": "application/json" },
      })
    );
  } catch (error) {
    if (error instanceof Response) {
      return fromFetchResponse(
        new Response(error.body, { ...error, status: error.status ?? 500 })
      );
    } else {
      console.error("Callback error", error);
      const message = error instanceof Error ? error.message : String(error);
      return fromFetchResponse(new Response(message, { status: 500 }));
    }
  }
}

function toFetchRequest(event: BackendLambdaRequest): Request {
  const hasBody = !["GET", "HEAD"].includes(event.method.toUpperCase());
  const body =
    hasBody && event.body ? Buffer.from(event.body, "base64") : undefined;
  const headers = new Headers(event.headers);
  const method = event.method;
  return new Request(event.url, {
    body,
    headers,
    method,
  });
}

async function fromFetchResponse(
  response: Response
): Promise<BackendLambdaResponse> {
  return {
    body: (await response.buffer()).toString("base64"),
    bodyEncoding: "base64",
    headers: Object.fromEntries(response.headers),
    statusCode: response.status ?? 200,
  };
}

import { Headers, Request, Response } from "node-fetch";
import { URL } from "url";

export declare type FetchRequestHandler = (
  request: Request
) =>
  | Promise<Response | string | object | number>
  | Response
  | string
  | object
  | number;

export function json(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    statusText: "OK",
    headers: { "Content-Type": "application/json" },
  });
}

type APIGatewayHandler = (
  event: APIGatewayEvent,
  context: unknown
) => Promise<APIGatewayResponse>;

export function asFetchRequest(
  handler: FetchRequestHandler
): APIGatewayHandler {
  return async function (event: APIGatewayEvent, context: unknown) {
    console.log({ context });
    try {
      const response = await handler(toFetchRequest(event));
      console.log({ response });
      return await toAPIGatewayResponse(toResponse(response));
    } catch (error) {
      console.log(error);
      if (error instanceof Response) return await toAPIGatewayResponse(error);
      else {
        console.error("Callback error", error);
        return toAPIGatewayResponse(
          new Response("Internal server error", { status: 500 })
        );
      }
    }
  };
}

function toResponse(response: Response | string | object | number): Response {
  if (response instanceof Response) return response;
  if (response === null || response === undefined)
    throw new TypeError("The callback must return a Response.");
  if (typeof response === "string" || response instanceof String)
    return new Response(String(response));
  if (typeof response === "number" || response instanceof Number)
    return new Response(undefined, { status: +response });
  return new Response(JSON.stringify(response));
}

function toFetchRequest(event: APIGatewayEvent): Request {
  const url = new URL(`https://${event.requestContext.domainName}`);
  url.pathname = event.rawPath;
  url.search = event.rawQueryString;

  const body = event.body
    ? Buffer.from(event.body, event.isBase64Encoded ? "base64" : "utf8")
    : undefined;

  const headers = new Headers(event.headers);

  const method = event.requestContext.http.method;

  return new Request(url, { body, headers, method });
}

async function toAPIGatewayResponse(
  response: Response
): Promise<APIGatewayResponse> {
  const body = (await response.buffer()).toString("base64");

  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  // Response.error has status code 0, this makes sense on client (network error),
  // on the server we always want to respond with 500.
  const statusCode = response.status === 0 ? 500 : response.status ?? 200;

  return { body, isBase64Encoded: true, headers, statusCode };
}

type APIGatewayResponse = {
  body: string;
  headers: Record<string, string>;
  isBase64Encoded: boolean;
  statusCode: number;
};

export type APIGatewayEvent = {
  version: "2.0";
  rawPath: string;
  rawQueryString: string;
  cookies?: string[];
  headers: Record<string, string>;
  requestContext: {
    accountId: string;
    domainName: string;
    domainPrefix: string;
    requestId: string;
    http: {
      method: string;
      path: string;
      protocol: "HTTP/1.1";
      sourceIp: string;
      userAgent: string;
    };
  };
  body?: string;
  isBase64Encoded?: boolean;
};

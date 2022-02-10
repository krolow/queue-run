import { URL } from "node:url";
import { handleHTTPRequest, Headers, LocalStorage } from "queue-run";

// https://docs.aws.amazon.com/lambda/latest/dg/services-apigateway.html#apigateway-example-event
export type APIGatewayHTTPEvent = {
  body?: string;
  cookies?: string[];
  headers: { [key: string]: string };
  isBase64Encoded: boolean;
  rawPath: string;
  rawQueryString: string;
  requestContext: {
    domainName: string;
    http: {
      method: string;
      path: string;
      protocol: string;
      sourceIp: string;
      userAgent: string;
    };
    requestId: string;
  };
  routeKey: string;
};

export type APIGatewayResponse = {
  body?: string;
  isBase64Encoded: boolean;
  headers: Record<string, string>;
  statusCode: number;
};

export type BackendLambdaRequest = {
  body?: string;
  headers: Record<string, string>;
  method: string;
  requestId?: string;
  url: string;
};

export default async function httpHandler(
  event: BackendLambdaRequest | APIGatewayHTTPEvent,
  newLocalStorage: () => LocalStorage
): Promise<APIGatewayResponse> {
  return await asFetchRequest(event, async (request) =>
    handleHTTPRequest({
      newLocalStorage,
      request,
      requestId: String(event.headers["x-amzn-trace-id"] ?? ""),
    })
  );
}

async function asFetchRequest(
  event: APIGatewayHTTPEvent | BackendLambdaRequest,
  // eslint-disable-next-line no-unused-vars
  handler: (request: Request) => Promise<Response | string | object>
): Promise<APIGatewayResponse> {
  const request = toFetchRequest(event);
  const response = await handler(request);
  return fromFetchResponse(request, toFetchResponse(request, response));
}

function toFetchRequest(
  event: APIGatewayHTTPEvent | BackendLambdaRequest
): Request {
  if ("requestContext" in event) {
    const { http } = event.requestContext;
    const { method } = http;
    const url = new URL(
      `https://${event.requestContext.domainName}${event.rawPath}?${event.rawQueryString}`
    ).href;

    const headers = new Headers(event.headers);
    if (event.cookies) headers.set("Cookie", event.cookies.join(";"));

    const hasBody = method !== "GET" && method !== "HEAD";
    const body =
      hasBody && event.body && event.isBase64Encoded
        ? Buffer.from(event.body, "base64")
        : event.body ?? null;
    return new Request(url, { body, headers, method });
  } else {
    const { headers, method, url } = event;
    const hasBody = method !== "GET" && method !== "HEAD";
    const body =
      hasBody && event.body ? Buffer.from(event.body, "base64") : null;
    return new Request(url, { body, headers, method });
  }
}

function toFetchResponse(
  request: Request,
  response: Response | Buffer | string | object | null | undefined
): Response {
  if (response instanceof Response) {
    const body = request.method === "HEAD" ? "" : response.body;
    return new Response(body, {
      headers: response.headers,
      status: response.status ?? 200,
    });
  }
  if (typeof response === "string" || response instanceof String) {
    return new Response(String(response), {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  if (response instanceof Buffer) {
    return new Response(response, {
      headers: { "Content-Type": "text/plain" },
    });
  }
  if (response === null || response === undefined) {
    if (request.method !== "HEAD") {
      console.error(
        "HTTP request returned null or undefined. If this was intentional, use this instead: return new Response(null)"
      );
    }
    return new Response(undefined, { status: 204 });
  }
  return new Response(JSON.stringify(response), {
    headers: { "Content-Type": "application/json" },
  });
}

async function fromFetchResponse(
  request: Request,
  response: Response
): Promise<APIGatewayResponse> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => (headers[key] = value));

  return {
    body:
      response.status === 204
        ? ""
        : Buffer.from(await response.arrayBuffer()).toString("base64"),
    isBase64Encoded: true,
    headers,
    statusCode: response.status ?? 200,
  };
}

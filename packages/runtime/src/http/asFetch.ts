import { URL } from "url";

// https://docs.aws.amazon.com/lambda/latest/dg/services-apigateway.html#apigateway-example-event
export type APIGatewayHTTPEvent = {
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
  };
  headers: { [key: string]: string };
  body?: string;
  isBase64Encoded: boolean;
};

export type APIGatewayResponse = {
  body: string;
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

export async function asFetchRequest(
  event: APIGatewayHTTPEvent | BackendLambdaRequest,
  // eslint-disable-next-line no-unused-vars
  handler: (request: Request) => Promise<Response | string | object>
): Promise<APIGatewayResponse> {
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

function toFetchRequest(
  event: APIGatewayHTTPEvent | BackendLambdaRequest
): Request {
  if ("requestContext" in event) {
    const { http } = event.requestContext;
    console.info(
      '[%s] %s %s %s "%s%"',
      http.sourceIp,
      http.protocol,
      http.method,
      http.path,
      http.userAgent
    );
    const { method } = http;
    const url = new URL(
      `https://${event.requestContext.domainName}${event.rawPath}?${event.rawQueryString}`
    ).href;
    const headers = new Headers(event.headers);
    const hasBody = method !== "GET" && method !== "HEAD";
    const body = hasBody
      ? event.body && event.isBase64Encoded
        ? Buffer.from(event.body, "base64")
        : event.body
      : undefined;
    return new Request(url, { body, headers, method });
  } else {
    const { headers, method, url } = event;
    const hasBody = method !== "GET" && method !== "HEAD";
    const body =
      hasBody && event.body ? Buffer.from(event.body, "base64") : undefined;
    return new Request(url, { body, headers, method });
  }
}

async function fromFetchResponse(
  response: Response
): Promise<APIGatewayResponse> {
  return {
    body: (await response.buffer()).toString("base64"),
    isBase64Encoded: true,
    headers: Object.fromEntries(Array.from(response.headers.entries())),
    statusCode: response.status ?? 200,
  };
}

import invariant from "tiny-invariant";
import { URL } from "url";

export class Request {
  body: Buffer | null;
  headers: Headers;
  method: string;
  url: string;

  constructor(
    url: string | URL,
    init?: {
      body?: Buffer | null;
      method?: string;
      headers?: Headers | { [key: string]: string };
    }
  ) {
    this.url = String(url);
    this.body = init?.body ?? null;
    this.headers = new Headers(init?.headers);
    this.method = init?.method ?? "GET";
  }

  text(): string {
    invariant(this.body, "This request has no body");
    return this.body.toString("utf8");
  }

  json(): unknown {
    return JSON.parse(this.text());
  }
}

export class Response {
  body: string | Buffer | null;
  headers: Headers;
  status: number;
  statusText: string;
  redirected: boolean;
  ok: boolean;

  constructor(
    body: string | null | undefined,
    options?: {
      status?: number;
      statusText?: string;
      headers?: Headers | { [key: string]: string };
    }
  ) {
    const status = parseInt(options?.status?.toString() ?? "200", 10);
    if (status < 200 || status > 599)
      throw new TypeError(
        "The status provided (0) is outside the range [200, 599]."
      );
    if (status === 204 && (body !== null || body !== undefined))
      throw new TypeError("The 204 status code does not allow a body.");

    this.body = body ?? null;
    this.status = status;
    this.statusText = options?.statusText ?? "";

    this.redirected =
      status === 301 ||
      status === 302 ||
      status === 303 ||
      status === 307 ||
      status === 308;
    this.ok = status >= 200 && status < 300;

    this.headers = new Headers(options?.headers);
  }
}

export class Headers {
  private headers = new Map<string, string[]>();

  constructor(object?: { [key: string]: string } | Headers) {
    if (object instanceof Headers) {
      object.forEach((value, name) => {
        this.set(name, value);
      });
    } else if (object) {
      Object.entries(object).forEach(([name, value]) => {
        this.set(name, value);
      });
    }
  }

  append(name: string, value: string): void {
    const header = this.headers.get(name.toLowerCase()) ?? [];
    header.push(String(value));
    this.headers.set(name.toLowerCase(), header);
  }

  delete(name: string): void {
    this.headers.delete(name.toLowerCase());
  }

  entries(): IterableIterator<[string, string[]]> {
    return this.headers.entries();
  }

  forEach(cb: (value: string, key: string) => void): void {
    this.headers.forEach((values, key) => cb(String(values), key));
  }

  get(name: string): string | undefined {
    const header = this.headers.get(name.toLowerCase());
    return header ? header.join(", ") : undefined;
  }

  has(name: string): boolean {
    return this.headers.has(name.toLowerCase());
  }

  keys(): IterableIterator<string> {
    return this.headers.keys();
  }

  set(name: string, value: string): void {
    this.headers.set(name.toLowerCase(), [String(value)]);
  }

  values(): IterableIterator<string[]> {
    return new Set<string>(
      Array.from(this.headers.values()).map((header) => header.join(", "))
    ).entries();
  }
}

export function json(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    statusText: "OK",
    headers: { "Content-Type": "application/json" },
  });
}

export function redirect(url: string, status = 303): Response {
  return new Response("", { status, headers: { location: url } });
}

export async function asFetch(
  event: APIGatewayEvent,
  cb: (request: Request) => Response | Promise<Response> | undefined | null
): Promise<APIGatewayResponse> {
  try {
    const response =
      (await cb(toFetchRequest(event))) ?? new Response(null, { status: 204 });
    if (response instanceof Response) return toAPIGatewayResponse(response);
    else throw new TypeError("The callback must return a Response.");
  } catch (error) {
    if (error instanceof Response) return toAPIGatewayResponse(error);
    else {
      const message = error instanceof Error ? error.message : String(error);
      return toAPIGatewayResponse(new Response(message, { status: 500 }));
    }
  }
}

function toFetchRequest(event: APIGatewayEvent): Request {
  const body = event.body
    ? Buffer.from(event.body, event.isBase64Encoded ? "base64" : "utf8")
    : null;

  const headers = new Headers(event.headers);
  const url = new URL(`https://${event.requestContext.domainName}`);
  url.pathname = event.rawPath;
  url.search = event.rawQueryString;

  return new Request(url, {
    headers,
    body,
    method: event.requestContext.http.method,
  });
}

function toAPIGatewayResponse(response: Response): APIGatewayResponse {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  return {
    body:
      response.body instanceof Buffer
        ? response.body.toString("base64")
        : response.body ?? "",
    isBase64Encoded: response.body instanceof Buffer,
    headers,
    statusCode: response.status,
  };
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

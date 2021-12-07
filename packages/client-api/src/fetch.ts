import invariant from "tiny-invariant";

export class Request {
  body: Buffer | null;
  headers: Headers;
  method: string;
  url: string;

  constructor(
    url: string,
    init?: {
      body?: Buffer | null;
      method?: string;
      headers?: Headers | { [key: string]: string };
    }
  ) {
    this.url = url;
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
  body: string | null;
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
    const header = this.headers.get(name.toLocaleLowerCase()) ?? [];
    header.push(String(value));
    this.headers.set(name.toLocaleLowerCase(), header);
  }

  delete(name: string): void {
    this.headers.delete(name.toLocaleLowerCase());
  }

  entries(): IterableIterator<[string, string[]]> {
    return this.headers.entries();
  }

  forEach(cb: (value: string, key: string) => void): void {
    this.headers.forEach((values, key) => cb(String(values), key));
  }

  get(name: string): string | undefined {
    const header = this.headers.get(name.toLocaleLowerCase());
    return header ? header.join(", ") : undefined;
  }

  has(name: string): boolean {
    return this.headers.has(name.toLocaleLowerCase());
  }

  keys(): IterableIterator<string> {
    return this.headers.keys();
  }

  set(name: string, value: string): void {
    this.headers.set(name.toLocaleLowerCase(), [String(value)]);
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
  event: CloudFrontEvent,
  cb: (request: Request) => Response | Promise<Response> | undefined | null
): Promise<CloudFrontResponse> {
  try {
    const request = event.Records?.[0].cf?.request;
    if (!request) throw new Response("", { status: 422 });
    const response =
      (await cb(toFetchRequest(request))) ??
      new Response(null, { status: 204 });
    if (response instanceof Response) return toCloudFrontResponse(response);
    else throw new TypeError("The callback must return a Response.");
  } catch (error) {
    if (error instanceof Response) return toCloudFrontResponse(error);
    else {
      const message = error instanceof Error ? error.message : String(error);
      return toCloudFrontResponse(new Response(message, { status: 500 }));
    }
  }
}

function toFetchRequest(request: CloudFrontRequest): Request {
  if (request.body?.inputTruncated)
    throw new Response("Request body too large, limit 40KB", { status: 413 });
  const buffer = request.body
    ? Buffer.from(request.body.data, request.body.encoding)
    : null;

  const headers = new Headers();
  Object.entries(request.headers).forEach(([, values]) => {
    values.forEach(({ key, value }) => headers.append(key, value));
  });

  return new Request(request.uri, {
    headers,
    body: buffer,
    method: request.method,
  });
}

function toCloudFrontResponse(response: Response): CloudFrontResponse {
  const headers: CloudFrontHeaders = {};
  response.headers.forEach((value, key) => {
    headers[key.toLocaleLowerCase()] = [{ key, value }];
  });

  return {
    status: String(response.status),
    statusDescription: response.statusText ?? "",
    headers,
    body: response.body ?? "",
  };
}

type CloudFrontResponse = {
  body: string;
  headers: CloudFrontHeaders;
  status: string;
  statusDescription: string;
};

type CloudFrontRequest = {
  body?: {
    action: "read-only";
    data: string;
    encoding: "base64";
    inputTruncated: false;
  };
  clientIp: string;
  headers: CloudFrontHeaders;
  method: "GET" | "POST" | "PUT" | "OPTIONS" | string;
  querystring?: "";
  uri: string /* eg "/" */;
};

type CloudFrontHeaders = Record<
  string /* eg x-forwarded-for */,
  Array<{
    key: string /* eg X-Forwarded-For */;
    value: string;
  }>
>;

export type CloudFrontEvent = {
  Records?: Array<{
    cf?: {
      config: {
        eventType: "viewer-request" | string;
        requestId: string;
      };
      request: CloudFrontRequest;
    };
  }>;
};

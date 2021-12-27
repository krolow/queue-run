/* eslint-disable no-unused-vars */
import {
  default as fetch,
  Headers as Headers,
  Request as Request,
  Response as Response,
} from "node-fetch";
import multipart from "parse-multipart-data";

export class RequestFormData {
  private fields: Map<
    string,
    { data: Buffer; filename?: string; contentType?: string }
  >;

  constructor(
    fields: Record<
      string,
      {
        data: Buffer;
        filename?: string;
        contentType?: string;
      }
    >
  ) {
    this.fields = new Map(Object.entries(fields));
  }

  has(name: string) {
    return this.fields.has(name);
  }

  get(name: string) {
    return this.fields.get(name);
  }

  entries() {
    return this.fields.entries();
  }

  keys() {
    return this.fields.keys();
  }

  values() {
    return this.fields.values();
  }
}

declare module "node-fetch" {
  interface Request {
    form: () => Promise<RequestFormData>;
  }
}

Request.prototype.form = async function () {
  const contentType = this.headers.get("content-type");
  const mimeType = contentType?.split(";")[0];
  if (mimeType === "multipart/form-data") {
    const boundary = contentType?.match(/;\s*boundary=([^;]+)/)?.[1];
    if (!boundary) throw new Error("multipart/form-data: missing boundary");
    const inputParts = multipart.parse(await this.buffer(), boundary);
    const fields = inputParts.reduce((fields, part) => {
      if (!part.name)
        throw new Response("multipart/form-data: missing part name");
      return {
        ...fields,
        [part.name]: {
          data: part.data,
          filename: part.filename,
          contentType: part.type,
        },
      };
    }, {});
    return new RequestFormData(fields);
  } else throw new Response("Unsupported Media Type", { status: 415 });
};

declare global {
  interface Request {
    form: () => Promise<RequestFormData>;
  }

  namespace NodeJS {
    interface Global {
      Headers: typeof Headers;
      Request: typeof Request;
      Response: typeof Response;
      fetch: typeof fetch;
    }
  }
}

// @ts-ignore
global.Request = Request;
// @ts-ignore
global.Response = Response;
// @ts-ignore
global.Headers = Headers;
// @ts-ignore
global.fetch = fetch;

export { Request, Response, Headers, fetch };

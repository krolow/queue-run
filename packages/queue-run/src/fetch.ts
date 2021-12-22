/* eslint-disable no-unused-vars */
import * as nodeFetch from "node-fetch";
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

nodeFetch.Request.prototype.form = async function () {
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
  } else throw new Error("Unsupported media type");
};

declare global {
  var $queueRun: {};
  var fetch: typeof nodeFetch.default;
  var Response: typeof nodeFetch.Response;
  var Headers: typeof nodeFetch.Headers;
  var Request: typeof nodeFetch.Request;

  export type Response = nodeFetch.Response;
  export type Headers = nodeFetch.Headers;
  export type Request = nodeFetch.Request;
}

global.Request = nodeFetch.Request;
global.Response = nodeFetch.Response;
global.Headers = nodeFetch.Headers;
global.fetch = nodeFetch.default;

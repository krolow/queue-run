/* eslint-disable no-unused-vars */
import {
  default as fetch,
  Headers as NodeFetchHeaders,
  Request as NodeFetchRequest,
  Response as NodeFetchResponse,
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

  static async from(request: NodeFetchRequest) {
    const contentType = request.headers.get("content-type");
    const mimeType = contentType?.split(";")[0];
    if (mimeType === "multipart/form-data") {
      const boundary = contentType?.match(/;\s*boundary=([^;]+)/)?.[1];
      if (!boundary) throw new Error("multipart/form-data: missing boundary");
      const inputParts = multipart.parse(await request.buffer(), boundary);
      const fields = inputParts.reduce((fields, part) => {
        if (!part.name)
          throw new NodeFetchResponse("multipart/form-data: missing part name");
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
    } else
      throw new NodeFetchResponse("Unsupported Media Type", { status: 415 });
  }
}

declare global {
  namespace NodeJS {
    interface Global {
      Headers: typeof NodeFetchHeaders;
      Request: typeof NodeFetchRequest;
      Response: typeof NodeFetchResponse;
      fetch: typeof fetch;
    }
  }
}

// @ts-ignore
global.Request = NodeFetchRequest;
// @ts-ignore
global.Response = NodeFetchResponse;
// @ts-ignore
global.Headers = NodeFetchHeaders;
// @ts-ignore
global.fetch = fetch;

export {
  NodeFetchRequest as Request,
  NodeFetchResponse as Response,
  NodeFetchHeaders as Headers,
  fetch,
};

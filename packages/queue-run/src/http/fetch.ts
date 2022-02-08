/* eslint-disable no-unused-vars */
import { Blob, File } from "fetch-blob/from.js";
import {
  default as nodeFetch,
  Headers as NodeFetchHeaders,
  Request as NodeFetchRequest,
  Response as NodeFetchResponse,
} from "node-fetch";

declare global {
  namespace NodeJS {
    interface Global {
      Blob: typeof Blob;
      fetch: typeof nodeFetch;
      File: typeof File;
      FormData: typeof FormData;
      Headers: typeof NodeFetchHeaders;
      Request: typeof NodeFetchRequest;
      Response: typeof NodeFetchResponse;
    }
  }
}

global.Blob = Blob;
global.fetch = nodeFetch as typeof fetch;
global.File = File;
global.FormData = FormData;
global.Headers = NodeFetchHeaders as typeof Headers;
global.Request = NodeFetchRequest as unknown as typeof Request;
global.Response = NodeFetchResponse as typeof Response;

export {
  Blob as Blob,
  File as File,
  nodeFetch as fetch,
  NodeFetchHeaders as Headers,
  NodeFetchRequest as Request,
  NodeFetchResponse as Response,
};

/* eslint-disable no-unused-vars */
import { Blob as FetchBlob } from "fetch-blob";
import { File as FetchFile } from "fetch-blob/file.js";
import {
  default as nodeFetch,
  Headers as NodeFetchHeaders,
  Request as NodeFetchRequest,
  Response as NodeFetchResponse,
} from "node-fetch";

declare global {
  namespace NodeJS {
    interface Global {
      Blob: typeof FetchBlob;
      File: typeof FetchFile;
      Headers: typeof NodeFetchHeaders;
      Request: typeof NodeFetchRequest;
      Response: typeof NodeFetchResponse;
      fetch: typeof nodeFetch;
    }
  }
}

global.Request = NodeFetchRequest as unknown as typeof Request;
global.Response = NodeFetchResponse as typeof Response;
global.Headers = NodeFetchHeaders as typeof Headers;
global.fetch = nodeFetch as typeof fetch;
global.Blob = FetchBlob;
global.File = FetchFile;

export {
  NodeFetchRequest as Request,
  NodeFetchResponse as Response,
  NodeFetchHeaders as Headers,
  nodeFetch as fetch,
  FetchBlob as Blob,
  FetchFile as File,
};

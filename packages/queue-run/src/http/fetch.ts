/* eslint-disable no-unused-vars */
import {
  default as fetch,
  Headers as NodeFetchHeaders,
  Request as NodeFetchRequest,
  Response as NodeFetchResponse,
} from "node-fetch";

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

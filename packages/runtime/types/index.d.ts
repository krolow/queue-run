/* eslint-disable no-unused-vars */
export type { Headers, Request, Response } from "node-fetch";
export { handler } from "../src/index";
export type * from "./middleware";
export type * from "./payload";
export type * from "./queues";
import type * as nodeFetch from "node-fetch";

declare global {
  var fetch: typeof nodeFetch.default;
  var Headers: typeof nodeFetch.Headers;
  var Request: typeof nodeFetch.Request;
  var Response: typeof nodeFetch.Response;
}

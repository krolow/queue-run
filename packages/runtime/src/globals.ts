/* eslint-disable no-unused-vars */
import * as http from "http";
import * as https from "https";
import * as nodeFetch from "node-fetch";
import type { pushMessage } from "./queues";

const httpAgent = new http.Agent();
const httpsAgent = new https.Agent();
const agent = ({ protocol }: { protocol: string }) =>
  protocol === "http:" ? httpAgent : httpsAgent;
const fetchWithAgent: typeof nodeFetch.default = (url, init) =>
  nodeFetch.default(url, { agent, ...init });
fetchWithAgent.isRedirect = nodeFetch.default.isRedirect;

declare global {
  var $queueRun: {
    pushMessage: (
      args: Omit<Parameters<typeof pushMessage>[0], "sqs" | "slug">
    ) => Promise<string>;
  };
  var fetch: typeof nodeFetch.default;
  var Response: typeof nodeFetch.Response;
  var Headers: typeof nodeFetch.Headers;
  var Request: typeof nodeFetch.Request;
}

global.fetch = fetchWithAgent;
global.Response = nodeFetch.Response;
global.Request = nodeFetch.Request;
global.Headers = nodeFetch.Headers;

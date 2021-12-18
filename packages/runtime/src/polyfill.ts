import * as http from "http";
import * as https from "https";
import * as nodeFetch from "node-fetch";

// Make fetch, Headers, Request, and Response available globally
// @ts-ignore
if (!global.fetch) {
  const httpAgent = new http.Agent();
  const httpsAgent = new https.Agent();
  const agent = ({ protocol }: { protocol: string }) =>
    protocol === "http:" ? httpAgent : httpsAgent;
  const fetchWithAgent: typeof nodeFetch.default = (url, init) =>
    nodeFetch.default(url, { agent, ...init });
  fetchWithAgent.isRedirect = nodeFetch.default.isRedirect;

  // @ts-ignore
  global.fetch = fetchWithAgent;
  // @ts-ignore
  global.Response = nodeFetch.Response;
  // @ts-ignore
  global.Headers = nodeFetch.Headers;
  // @ts-ignore
  global.Request = nodeFetch.Request;
}

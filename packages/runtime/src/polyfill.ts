import * as http from "http";
import * as https from "https";
import * as nodeFetch from "node-fetch";

if (!global.fetch) {
  const httpAgent = new http.Agent();
  const httpsAgent = new https.Agent();
  const agent = ({ protocol }: { protocol: string }) =>
    protocol === "http:" ? httpAgent : httpsAgent;
  const fetchWithAgent: typeof nodeFetch.default = (url, init) =>
    nodeFetch.default(url, { agent, ...init });
  fetchWithAgent.isRedirect = nodeFetch.default.isRedirect;

  global.fetch = fetchWithAgent;
  global.Response = nodeFetch.Response;
  global.Headers = nodeFetch.Headers;
  global.Request = nodeFetch.Request;
}

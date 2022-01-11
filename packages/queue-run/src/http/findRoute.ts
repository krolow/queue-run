import invariant from "tiny-invariant";
import { URL } from "url";
import {
  HTTPRoute,
  loadManifest,
  loadModule,
  logError,
} from "../shared/index.js";
import { RouteExports, RouteMiddleware } from "./exports.js";
import { Response } from "./fetch.js";
import { logResponse } from "./middleware.js";

/**
 * Load the route handler for the given URL.
 *
 * @param url Request URL
 * @returns module All exports from the JavaScript module
 * @returns middleware Combined middleware from module, _middleware.ts, or default middleware
 * @returns params Named path parameters
 * @returns route The HTTP route configuration
 */
export default async function findRoute(url: string): Promise<{
  module: RouteExports;
  middleware: RouteMiddleware;
  params: { [key: string]: string | string[] };
  route: HTTPRoute;
}> {
  const { routes } = await loadManifest();
  const pathname = new URL(url).pathname;
  const matches = Array.from(routes.values())
    .map((route) => ({ route, match: route.match(pathname) }))
    .filter(({ match }) => match)
    .map(({ match, route }) => ({ params: match ? match.params : {}, route }))
    .sort((a, b) => moreSpecificRoute(a.params, b.params));
  const mostSpecific = matches[0];
  if (!mostSpecific) throw new Response("Not Found", { status: 404 });
  const { route, params } = mostSpecific;

  const loaded = await loadModule<RouteExports, RouteMiddleware>(
    route.filename,
    { onResponse: logResponse, onError: logError }
  );
  invariant(loaded, "Could not load route module");
  const { module, middleware } = loaded;

  return { module, middleware, params, route };
}

function moreSpecificRoute(
  a: { [key: string]: string | string[] },
  b: { [key: string]: string | string[] }
) {
  return Object.keys(a).length - Object.keys(b).length;
}

import { URL } from "node:url";
import invariant from "tiny-invariant";
import { loadModule } from "../shared/loadModule.js";
import { logError } from "../shared/logError.js";
import { HTTPRoute, loadManifest } from "../shared/manifest.js";
import { RouteExports, RouteMiddleware } from "./exports.js";
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
  const matches = Array.from(routes.entries())
    .map(([path, route]) => ({ path, route, match: route.match(pathname) }))
    .filter(({ match }) => match)
    .map(({ match, path, route }) => ({
      params: match ? match.params : {},
      path,
      route,
    }))
    .sort((a, b) => moreSpecificRoute(a, b));
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
  a: { path: string; params: { [key: string]: string | string[] } },
  b: { path: string; params: { [key: string]: string | string[] } }
) {
  // Which route matches more path parameters:
  // api/foo/[id] > api/foo
  const params = Object.keys(a.params).length - Object.keys(b.params).length;
  // Which route is longer, ignoring path parameters:
  // api/foo/[id].xml > api/foo/[id]
  const length =
    b.path.replace(/:(.*?)(\/|$)/g, ":").length -
    a.path.replace(/:(.*?)(\/|$)/g, ":").length;
  return params === 0 ? length : params;
}

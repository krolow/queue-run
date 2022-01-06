import invariant from "tiny-invariant";
import { URL } from "url";
import loadModule from "../shared/loadModule";
import { logError } from "../shared/logError";
import { HTTPRoute, loadManifest } from "../shared/manifest";
import { RouteExports, RouteMiddleware } from "./exports";
import { Response } from "./fetch";
import { logResponse } from "./middleware";

export default async function findRoute(url: string): Promise<{
  module: RouteExports;
  // Combined middleware for this route (includes exports from module)
  middleware: RouteMiddleware;
  // Parameters from the URL path
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

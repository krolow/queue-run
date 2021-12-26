import { MatchFunction } from "path-to-regexp";
import invariant from "tiny-invariant";
import { URL } from "url";
import loadModule from "../loadModule";
import { RouteExports, RouteMiddleware } from "../types";
import loadRoutes from "./loadRoutes";

// Runtime definition for an HTTP route
export type HTTPRoute = {
  // Accepted content types, eg application/json, text/*, */*
  accepts: Set<string>;
  // True if QueueRun should handle CORS
  cors: boolean;
  // Filename of the module
  filename: string;
  // Match the request URL and return named parameters
  match: MatchFunction<{ [key: string]: string }>;
  // Allowed HTTP methods, eg ["GET", "POST"] or "*"
  methods: Set<string>;
  // Timeout in seconds
  timeout: number;
};

export default async function findRoute(url: string): Promise<{
  module: RouteExports;
  // Combined middleware for this route (includes exports from module)
  middleware: RouteMiddleware;
  // Parameters from the URL path
  params: { [key: string]: string | string[] };
  route: HTTPRoute;
}> {
  const routes = await loadRoutes();
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
    route.filename
  );
  invariant(loaded, "Could not load route module");
  const { module, middleware } = loaded;

  return { module, middleware, params, route };
}

function moreSpecificRoute(
  a: { [key: string]: string },
  b: { [key: string]: string }
) {
  return Object.keys(a).length - Object.keys(b).length;
}

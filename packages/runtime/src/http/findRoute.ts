import { Response } from "node-fetch";
import type { Middleware, RequestHandler, RouteConfig } from "queue-run";
import { URL } from "url";
import loadModule from "../loadModule";
import { HTTPRoute } from "./HTTPRoute";

export type RouteModule = {
  config?: RouteConfig;
} & {
  [method: string]: RequestHandler;
} & Middleware;

export default async function findRoute(
  url: string,
  routes: Map<string, HTTPRoute>
): Promise<{
  module: RouteModule;
  params: { [key: string]: string };
  route: HTTPRoute;
}> {
  const pathname = new URL(url).pathname;
  const matches = Array.from(routes.values())
    .map((route) => ({
      route,
      match: route.match(pathname),
    }))
    .filter(({ match }) => match)
    .map(({ match, route }) => ({
      params: match ? match.params : {},
      route,
    }))
    .sort((a, b) => moreSpecificRoute(a.params, b.params));
  if (!matches[0]) throw new Response("Not Found", { status: 404 });

  const { route, params } = matches[0];

  const module = await loadModule<RouteModule>(route.filename);
  if (!module) throw new Response("Not Found", { status: 404 });

  return { module, params, route };
}

function moreSpecificRoute(
  a: { [key: string]: string },
  b: { [key: string]: string }
) {
  return Object.keys(a).length - Object.keys(b).length;
}

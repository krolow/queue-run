import { Response } from "node-fetch";
import type { Middleware, RequestHandler, RouteConfig } from "queue-run";
import { URL } from "url";
import loadModule from "../loadModule";
import { HTTPRoute } from "./HTTPRoute";
import postToQueue from "./postToQueue";

export default async function findRoute(
  url: string,
  routes: Map<string, HTTPRoute>
): Promise<{
  handler: RequestHandler;
  middleware: Middleware;
  params: { [key: string]: string };
  route: HTTPRoute;
}> {
  const pathname = new URL(url).pathname.slice(1);
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

  const module = await loadModule<RequestHandler, RouteConfig>(route.filename);
  if (!module) throw new Response("Not Found", { status: 404 });
  const { handler, ...middleware } = module;

  return {
    handler: route.queue
      ? (request, metadata) => postToQueue(route, request, metadata)
      : handler,
    middleware,
    params,
    route,
  };
}

function moreSpecificRoute(
  a: { [key: string]: string },
  b: { [key: string]: string }
) {
  return Object.keys(a).length - Object.keys(b).length;
}

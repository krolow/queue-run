import { Response } from "node-fetch";
import { URL } from "url";
import { RouteConfig } from "../types";
import { Middleware } from "../types/middleware";
import { RequestHandler } from "./../types/handlers.d";
import loadModule from "./loadModule";
import { Route } from "./loadServices";
import queuingHandler from "./queueingHandler";

export default async function loadRoute(
  url: string,
  routes: Map<string, Route>
): Promise<{
  handler: RequestHandler;
  middleware: Middleware;
  params: { [key: string]: string };
  route: Route;
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
      ? (request, metadata) => queuingHandler(route, request, metadata)
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

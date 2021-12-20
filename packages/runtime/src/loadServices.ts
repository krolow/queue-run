import chalk from "chalk";
import glob from "fast-glob";
import { Response } from "node-fetch";
import path from "path";
import { match, MatchFunction, pathToRegexp } from "path-to-regexp";
import invariant from "tiny-invariant";
import { URL } from "url";
import {
  QueueConfig,
  QueueHandler,
  RequestHandler,
  RouteConfig,
} from "../types";
import { Middleware } from "../types/middleware";
import loadModule from "./loadModule";

export type Services = {
  queues: Map<string, Queue>;
  routes: Map<string, Route>;
};

type Queue = {
  checkContentType: (type: string) => boolean;
  checkMethod: (method: string) => boolean;
  filename: string;
  timeout: number;
};

type Route = {
  checkContentType: (type: string) => boolean;
  checkMethod: (method: string) => boolean;
  filename: string;
  match?: MatchFunction<{ [key: string]: string }>;
  timeout: number;
};

export async function loadServices(dirname: string): Promise<Services> {
  const cwd = process.cwd();
  process.chdir(dirname);
  try {
    const queues = await loadQueues();
    const routes = await loadRoutes(queues);
    return { queues, routes };
  } finally {
    process.chdir(cwd);
  }
}

export function displayServices({ routes, queues }: Services) {
  console.info(
    chalk.bold.blue("λ: %s"),
    routes.size > 0 ? "API:" : "No routes"
  );
  const rows: [string, string][] = Array.from(routes.entries()).map(
    ([path, { filename }]) => [path, filename]
  );
  const width = Math.max(...rows.map(([path]) => path.length));
  const table = rows.map(([path, filename]) =>
    [path.padEnd(width), filename].join("  →  ")
  );
  console.info(
    "%s",
    table
      .sort()
      .map((line) => `   ${line}`)
      .join("\n")
  );

  console.info(
    chalk.bold.blue("λ: %s"),
    queues.size > 0 ? "Queues:" : "No queues"
  );
  console.info(
    "%s",
    Array.from(queues.keys())
      .map((name, i, all) => [i === all.length - 1 ? "└──" : "├──", name])
      .map(([prefix, name]) => `   ${prefix} ${name}`)
      .join("\n")
  );
}

export async function loadRoute(
  url: string,
  { routes }: Services
): Promise<
  {
    handler: RequestHandler;
    params: { [key: string]: string };
  } & Route &
    Middleware
> {
  const pathname = new URL(url).pathname.slice(1);
  const route = Array.from(routes.values())
    .map((route) => ({
      ...route,
      match: route.match?.(pathname),
    }))
    .filter(({ match }) => match)
    .map(({ match, ...route }) => ({
      params: match ? match.params : {},
      ...route,
    }))
    .sort((a, b) => moreSpecificRoute(a.params, b.params))[0];
  if (!route) throw new Response("Not Found", { status: 404 });

  const { filename, params } = route;
  invariant(params);
  const module = await loadModule<RequestHandler, RouteConfig>(filename);
  if (!module) throw new Response("Not Found", { status: 404 });
  const { handler } = module;

  return { handler, ...route };
}

function moreSpecificRoute(
  a: { [key: string]: string },
  b: { [key: string]: string }
) {
  return Object.keys(a).length - Object.keys(b).length;
}

async function loadRoutes(
  queues: Services["queues"]
): Promise<Services["routes"]> {
  const routes: Services["routes"] = new Map();
  const dupes = new Set<string>();

  const filenames = await glob("api/**/[!_]*.{js,ts}");
  for (const filename of filenames) {
    const module = await loadModule<() => void, RouteConfig>(filename);
    invariant(module, `Module ${filename} not found`);

    const route = pathFromFilename(filename);

    const regexp = pathToRegexp(route).toString();
    if (dupes.has(regexp))
      throw new Error(`Duplicate route "${route}" from "${filename}"`);
    dupes.add(regexp);

    routes.set(route, {
      ...getRouteConfig(module.config),
      filename,
      match: match(route),
    });
  }

  for (const [path, route] of queues.entries()) routes.set(path, route);
  return routes;
}

// foo/$bar/index.js -> foo/:bar
function pathFromFilename(filename: string): string {
  // Separate basename, so we can drop extension and /index.js
  const basename = path.basename(filename, path.extname(filename)).normalize();
  const directory = path.dirname(filename).normalize();
  const withoutIndex =
    basename === "index" ? directory : `${directory}/${basename}`;

  const expanded = expandNestedRoutes(withoutIndex);

  if (!expanded.split("/").every(isValidPathPart))
    throw new Error(
      `Cannot convert "${filename}" to a route, only alphanumeric, hyphen, and underscore allowed`
    );

  return renamePathProperties(expanded);
}

// Support nested routes: foo.bar.js is the same as foo/bar.js
function expandNestedRoutes(filename: string): string {
  return filename.replace(/\./g, "/").replace(/\/+/g, "/");
}

// Filenames look like `foo/$bar.js`, but reg-exp paths and rewrite rules use
// `foo/:bar`. Filenames don't allow colon (Windows).
function renamePathProperties(filename: string): string {
  return filename.replace(
    /(\/|^)\$(.*?)(\/|$)/g,
    (_, prev, key, next) => `${prev}:${key || "rest*"}${next}`
  );
}

function isValidPathPart(part: string): boolean {
  return /^(\$?[a-z0-9_-]*|\$*\*)$/i.test(part);
}

function getRouteConfig(config: RouteConfig) {
  return {
    timeout: getTimeout(config, { max: 30, default: 30 }),
    checkContentType: checkContentType(config),
    checkMethod: checkMethod(config),
  };
}

function checkMethod(config: RouteConfig): (method: string) => boolean {
  if (!config.methods) return () => true;
  const methods = new Set(
    (Array.isArray(config.methods) ? config.methods : [config.methods]).map(
      (method) => method.toUpperCase()
    )
  );
  if (
    !Array.from(Object.keys(methods)).every((method) => /^[A-Z]+$/.test(method))
  )
    throw new Error(
      `config.methods must contain only HTTP methods like "GET" or ["GET", "POST"]`
    );
  return (method: string) => methods.has(method.toUpperCase());
}

function checkContentType(config: RouteConfig): (type: string) => boolean {
  if (!config.accepts) return () => true;

  const accepts = Array.isArray(config.accepts)
    ? config.accepts
    : [config.accepts];
  if (!accepts.every((accepts) => /^[a-z]+\/([a-z]+|\*)$/i.test(accepts)))
    throw new Error(
      `config.accepts must be content type like "application/json" or "text/*"`
    );

  const exact = new Set(accepts.filter((accepts) => !accepts.endsWith("/*")));
  const primary = new Set(
    (Array.isArray(config.accepts) ? config.accepts : [config.accepts])
      .filter((type) => type.endsWith("/*"))
      .map((accepts) => accepts.split("/")[0])
  );
  return (type: string) => exact.has(type) || primary.has(type.split("/")[0]);
}

async function loadQueues(): Promise<Services["queues"]> {
  const queues: Services["queues"] = new Map();
  const filenames = await glob("queues/[!_]*.{js,ts}");
  for (const filename of filenames) {
    const module = await loadModule<QueueHandler, QueueConfig>(filename);
    invariant(module, `Module ${filename} not found`);

    const route = queuePathFromFilename(filename);
    queues.set(route, {
      ...getQueueConfig(module.config),
      filename,
    });
  }
  return queues;
}

// queue/foo.fifo.js => queues/foo.fifo
function queuePathFromFilename(filename: string): string {
  const basename = path.basename(filename, path.extname(filename)).normalize();
  const isFifo = basename.endsWith(".fifo");
  const queueName = isFifo ? basename.slice(0, -5) : basename;
  if (!/^[a-z0-9_-]+$/i.test(queueName))
    throw new Error(
      `Invalid queue name, only alphanumeric, hyphen, and underscore allowed`
    );
  if (queueName.length > 40)
    throw new Error("Queue name too long, maximum 40 characters");
  return isFifo ? `queue/${basename}/:group` : `queue/${basename}`;
}

function getQueueConfig(config: QueueConfig) {
  return {
    checkContentType: checkContentType(config),
    checkMethod: (method: string) => method.toUpperCase() === "POST",
    timeout: getTimeout(config, { max: 500, default: 30 }),
  };
}

function getTimeout(
  { timeout }: { timeout?: number },
  { max, default: def }: { max: number; default: number }
): number {
  if (timeout === undefined || timeout === null) return def;
  if (typeof timeout !== "number")
    throw new Error("config.timeout must be a number");
  if (timeout < 1) throw new Error("config.timeout must be at least 1 second");
  if (timeout > max)
    throw new Error(`config.timeout cannot be more than ${max} seconds`);
  return timeout;
}

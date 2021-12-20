import chalk from "chalk";
import glob from "fast-glob";
import { Response } from "node-fetch";
import path from "path";
import { Key, match, MatchFunction, pathToRegexp } from "path-to-regexp";
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
  filename: string;
  url?: string;
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
  const routes = new Map<string, Route>();
  const dupes = new Set<string>();

  const filenames = await glob("api/**/[!_]*.{js,ts}");
  for (const filename of filenames) {
    const module = await loadModule<() => void, RouteConfig>(filename);
    invariant(module, `Module ${filename} not found`);

    const path = pathFromFilename(filename.replace(/^api\//, ""));

    const signature = path.replace(/:(.*?)(\/|$)/g, ":$2");
    if (dupes.has(signature))
      throw new Error(`Error in "${filename}": duplicate route exists`);
    dupes.add(signature);

    routes.set(path, {
      ...getRouteConfig(module.config),
      filename,
      match: match(path),
    });
  }

  for (const [name, queue] of queues.entries()) {
    if (!queue.url) continue;

    const path = renamePathProperties(queue.url.slice(1));
    verifyPathParameters(queue.filename, path);

    const signature = path.replace(/:(.*?)(\/|$)/g, ":$2");
    if (dupes.has(signature))
      throw new Error(`Error in "${queue.filename}": duplicate route exists`);
    dupes.add(signature);

    routes.set(path, {
      checkContentType: queue.checkContentType,
      checkMethod: (method: string) => method.toUpperCase() === "POST",
      filename: queue.filename,
      match: match(path),
      timeout: queue.timeout,
    });
  }
  return routes;
}

// foo/[bar]/index.js -> foo/:bar
//
// This also does a lot of validation and throws errors for common mistakes like
// space in filename, duplicate parameter names, etc.
function pathFromFilename(filename: string): string {
  // Separate basename, so we can drop extension and /index.js
  const basename = path.basename(filename, path.extname(filename)).normalize();
  const directory = path.dirname(filename).normalize();
  const withoutIndex =
    basename === "index" ? directory : `${directory}/${basename}`;

  const renamed = renamePathProperties(withoutIndex);
  const expanded = expandNestedRoutes(renamed);

  verifyPathParameters(filename, expanded);
  return expanded;
}

function verifyPathParameters(filename: string, path: string) {
  const keys: Key[] | undefined = [];
  pathToRegexp(path, keys);

  if (new Set(keys.map((key) => key.name)).size < keys.length)
    throw new Error(`Error in "${filename}": duplicate parameter names`);

  const catchAll = keys.findIndex(({ modifier }) => modifier === "*");
  if (catchAll >= 0 && catchAll !== keys.length - 1)
    throw new Error(
      `Error in "${filename}": catch all parameter must be the last one`
    );

  if (!path.split("/").every(isValidPathPart))
    throw new Error(
      `Error in "${filename}": only alphanumeric, hyphen, and underscore allowed as path parts`
    );
}

// Support nested routes: foo.bar.js is the same as foo/bar.js
function expandNestedRoutes(filename: string): string {
  return filename.replace(/\./g, "/").replace(/\/+/g, "/");
}

// foo/[bar].js -> foo/:bar
// foo/[...bar].js -> foo/:bar*
//
// path-to-regexp uses colon for named parameters.  Can't use these in file
// names, Windows always used colon for something else.  Besides, it's easier to
// see parameters in file names when using brackets than with a single prefix
// (colon, dollar, etc).
function renamePathProperties(filename: string): string {
  return filename
    .split("/")
    .map((part) =>
      part.replace(/^\[\.{3}(.*)\]$/, ":$1*").replace(/^\[(.*)\]$/, ":$1")
    )
    .join("/");
}

// path-to-regexp supports a lot more options than we want to allow in filenames.
// If you need all these options, use rewrite rules.
//  We limit to "file_name_92-3.js".
function isValidPathPart(part: string): boolean {
  return /^([a-z0-9_-]+)|(:[a-z0-9_-]+\*?)$/i.test(part);
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

function checkContentType(config: {
  accepts?: string[] | string;
}): (type: string) => boolean {
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

    const queueName = queueNameFromFilename(filename);
    queues.set(queueName, {
      ...getQueueConfig(module.config),
      filename,
    });
  }
  return queues;
}

// queue/foo.fifo.js => foo.fifo
function queueNameFromFilename(filename: string): string {
  const queueName = path.basename(filename, path.extname(filename)).normalize();
  if (!/^[a-z0-9_-]+(\.fifo)?$/i.test(queueName))
    throw new Error(
      `Invalid queue name, only alphanumeric, hyphen, and underscore allowed`
    );
  if (queueName.length > 40)
    throw new Error("Queue name too long, maximum 40 characters");
  return queueName;
}

function getQueueConfig(config: QueueConfig) {
  if (config.url && !config.url.startsWith("/"))
    throw new Error('config.url must start with "/"');
  return {
    checkContentType: checkContentType(config),
    timeout: getTimeout(config, { max: 500, default: 30 }),
    url: config.url,
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

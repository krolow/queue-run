import chalk from "chalk";
import glob from "fast-glob";
import path from "path";
import { Key, match, pathToRegexp } from "path-to-regexp";
import invariant from "tiny-invariant";
import { QueueConfig, QueueHandler, RouteConfig } from "./handlers";
import loadModule from "./loadModule";
import { HTTPRoute } from "./Route";

export type Services = {
  queues: Map<string, Queue>;
  routes: Map<string, HTTPRoute>;
};

export type Queue = {
  accepts: Set<string>;
  cors: boolean;
  filename: string;
  isFifo: boolean;
  path: string | null;
  queueName: string;
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

async function loadRoutes(
  queues: Services["queues"]
): Promise<Services["routes"]> {
  const routes = new Map<string, HTTPRoute>();
  const dupes = new Set<string>();

  const filenames = await glob("api/**/[!_]*.{js,ts}");
  for (const filename of filenames) {
    try {
      const module = await loadModule<() => void, RouteConfig>(filename);
      invariant(module, "Module not found");

      const path = pathFromFilename(filename.replace(/^api\//, ""));

      const signature = path.replace(/:(.*?)(\/|$)/g, ":$2");
      if (dupes.has(signature))
        throw new Error(
          "An identical route already exists, maybe with different parameter names"
        );
      dupes.add(signature);

      routes.set(path, {
        accepts: getContentTypes(module.config),
        cors: module.config.cors ?? true,
        methods: getMethods(module.config),
        filename,
        match: match(path),
        timeout: getTimeout(module.config, { max: 30, default: 30 }),
      });
    } catch (error) {
      throw new Error(`Error in "${filename}": ${error}`);
    }
  }

  for (const queue of queues.values()) {
    if (!queue.path) continue;

    try {
      const path = renamePathProperties(
        queue.path.replace(/^\/?(.*?)\/?$/g, "$1")
      );
      verifyPathParameters(path);

      const signature = path.replace(/:(.*?)(\/|$)/g, ":$2");
      if (dupes.has(signature))
        throw new Error(`Error in "${queue.filename}": duplicate route exists`);
      dupes.add(signature);

      routes.set(path, {
        accepts: queue.accepts,
        cors: queue.cors,
        methods: new Set(["POST"]),
        filename: queue.filename,
        queue,
        match: match(path),
        timeout: queue.timeout,
      });
    } catch (error) {
      throw new Error(`Error in "${queue.filename}": ${error}`);
    }
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

  verifyPathParameters(expanded);
  return expanded;
}

function verifyPathParameters(path: string) {
  const keys: Key[] | undefined = [];
  pathToRegexp(path, keys);

  if (new Set(keys.map((key) => key.name)).size < keys.length)
    throw new Error("Found two parameters with the same name");

  const catchAll = keys.findIndex(({ modifier }) => modifier === "*");
  if (catchAll >= 0 && catchAll !== keys.length - 1)
    throw new Error(
      "The catch-all parameter can only come at the end of the path"
    );

  if (!path.split("/").every(isValidPathPart))
    throw new Error(
      "Path parts may only be alphanumeric, dash, underscore, or dot"
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

function getMethods(config: RouteConfig): Set<string> {
  const methods = new Set(
    (Array.isArray(config.methods)
      ? config.methods
      : [config.methods ?? "*"]
    ).map((method) => method.toUpperCase())
  );
  if (!Array.from(methods).every((method) => /^[A-Z]+|\*$/.test(method)))
    throw new Error(
      `config.methods list acceptable HTTP methods, like "GET" or ["GET", "POST"]`
    );
  return methods;
}

function getContentTypes(config: { accepts?: string[] | string }): Set<string> {
  const accepts = new Set(
    Array.isArray(config.accepts) ? config.accepts : [config.accepts ?? "*/*"]
  );
  if (
    !Array.from(accepts).every((accepts) =>
      /^([a-z]+|\*)\/([a-z]+|\*)$/i.test(accepts)
    )
  )
    throw new Error(
      `config.accepts lists acceptable MIME types, like "application/json" or "text/*"`
    );
  return accepts;
}

async function loadQueues(): Promise<Services["queues"]> {
  const queues: Services["queues"] = new Map();
  const filenames = await glob("queues/[!_]*.{js,ts}");
  for (const filename of filenames) {
    try {
      const module = await loadModule<QueueHandler, QueueConfig>(filename);
      invariant(module, "Module not found");

      const queueName = queueNameFromFilename(filename);
      const isFifo = queueName.endsWith(".fifo");
      const path = getQueuePath(module.config, isFifo);
      if (module.config.accepts && !path)
        throw new Error(
          "config.accepts only applicable together with config.url"
        );
      if (module.config.cors !== undefined && !path)
        throw new Error("config.cors only applicable together with config.url");

      queues.set(queueName, {
        accepts: getContentTypes(module.config),
        cors: module.config.cors ?? true,
        filename,
        isFifo,
        path: getQueuePath(module.config, isFifo),
        queueName,
        timeout: getTimeout(module.config, { max: 500, default: 30 }),
      });
    } catch (error) {
      throw new Error(`Error in "${filename}": ${error}`);
    }
  }
  return queues;
}

// queue/foo.fifo.js => foo.fifo
function queueNameFromFilename(filename: string): string {
  const queueName = path.basename(filename, path.extname(filename)).normalize();
  if (!/^[a-z0-9_-]+(\.fifo)?$/i.test(queueName))
    throw new Error(
      "Queue name must be alphanumeric, dash, or underscore, and optionally followed by '.fifo'"
    );
  if (queueName.length > 40)
    throw new Error("Queue name longer than the allowed 40 characters");
  return queueName;
}

function getQueuePath(config: QueueConfig, isFifo: boolean) {
  if (!config.url) return null;
  if (!config.url.startsWith("/"))
    throw new Error('config.url is a relative URL and must start with "/"');

  const path = renamePathProperties(config.url);

  const keys: Key[] | undefined = [];
  pathToRegexp(path, keys);
  const hasGroupParam = keys.find(({ name }) => name === "group");
  const hasDedupeParam = keys.find(({ name }) => name === "dedupe");
  if (isFifo && !hasGroupParam)
    throw new Error(
      "FIFO queue must have a :group parameter in the URL, and optionally a :dedupe parameter"
    );
  if (!isFifo && (hasGroupParam || hasDedupeParam)) {
    console.warn(
      chalk.yellow(
        'Found standard queue "%s" with the parameter %s in the URL. This parameter is used for FIFO queues. Was this intentional?'
      ),
      config.url,
      hasGroupParam ? ":group" : ":dedupe"
    );
  }

  return path;
}

function getTimeout(
  { timeout }: { timeout?: number },
  { max, default: def }: { max: number; default: number }
): number {
  if (timeout === undefined || timeout === null) return def;
  if (typeof timeout !== "number")
    throw new Error("config.timeout must be a number (seconds)");
  if (timeout < 1) throw new Error("config.timeout must be at least 1 second");
  if (timeout > max)
    throw new Error(`config.timeout cannot be more than ${max} seconds`);
  return timeout;
}

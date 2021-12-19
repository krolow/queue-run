import { loadModule, QueueConfig, QueueHandler } from "@queue-run/runtime";
import chalk from "chalk";
import glob from "fast-glob";
import path from "path";
import { match, MatchFunction, pathToRegexp } from "path-to-regexp";
import invariant from "tiny-invariant";

export type Topology = {
  queues: Map<string, Route<QueueConfig>>;
  routes: Map<string, Route<{}>>;
};

type Route<Config = {}> = {
  filename: string;
  match: MatchFunction;
  config: Config;
};

export async function loadTopology(targetDir: string): Promise<Topology> {
  const cwd = process.cwd();
  process.chdir(targetDir);
  try {
    const queues = await mapQueues();
    const routes = await mapRoutes(queues);
    return { queues, routes };
  } finally {
    process.chdir(cwd);
  }
}

export async function showTopology({ queues, routes }: Topology) {
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

async function mapRoutes(
  queues: Topology["queues"]
): Promise<Topology["routes"]> {
  const routes = new Map<string, Route<{}>>();
  const dupes = new Set<string>();
  const filenames = await glob("api/**/[!_]*.{js,ts}");
  for (const filename of filenames) {
    const module = await loadModule<() => void, { timeout?: number }>(filename);
    invariant(module, `Module ${filename} not found`);

    const { timeout } = module.config;
    validateTimeout(timeout, 30);

    const route = pathFromFilename(filename).replace(
      /(\/|^)\$(.*?)(\/|$)/g,
      (_, prev, key, next) => `${prev}:${key || "rest*"}${next}`
    );

    const regexp = pathToRegexp(route).toString();
    if (dupes.has(regexp))
      throw new Error(`Duplicate route "${route}" from "${filename}"`);
    dupes.add(regexp);

    routes.set(route, {
      config: module.config,
      filename,
      match: match(route),
    });
  }

  for (const [path, route] of queues.entries()) routes.set(path, route);
  return routes;
}

function pathFromFilename(filename: string): string {
  const basename = path.basename(filename, path.extname(filename)).normalize();
  const directory = path.dirname(filename).normalize();
  const withoutIndex =
    basename === "index" ? directory : `${directory}/${basename}`;
  const expanded = withoutIndex.replace(/\./g, "/").replace(/\/+/g, "/");
  const valid = expanded
    .split("/")
    .every((part) => /^(\$?[a-zA-Z0-9_-]*|\$*\*)$/.test(part));
  if (!valid) throw new Error(`Cannot convert "${filename}" to a route`);
  return expanded;
}

async function mapQueues(): Promise<Topology["queues"]> {
  const queues = new Map<string, Route<QueueConfig>>();
  const filenames = await glob("queues/[!_]*.{js,ts}");
  for (const filename of filenames) {
    const module = await loadModule<QueueHandler, QueueConfig>(filename);
    invariant(module, `Module ${filename} not found`);

    const { timeout } = module.config;
    // Maximum Lambda execution time
    validateTimeout(timeout, 900);

    const route = queuePathFromFilename(filename);
    queues.set(route, {
      config: module.config,
      filename,
      match: match(route),
    });
  }
  return queues;
}

function queuePathFromFilename(filename: string): string {
  const basename = path.basename(filename, path.extname(filename)).normalize();
  const isFifo = basename.endsWith(".fifo");
  const withoutFifo = isFifo ? basename.slice(0, -5) : basename;
  if (!/^[a-zA-Z0-9_-]+$/.test(withoutFifo))
    throw new Error(
      `Invalid queue name, only alphanumeric, hyphen, and underscore allowed`
    );
  if (withoutFifo.length > 40)
    throw new Error("Queue name too long, maximum 40 characters");
  return isFifo ? `queue/${basename}/:group` : `queue/${basename}`;
}

function validateTimeout(
  timeout: number | undefined,
  maxTimeout?: number
): void {
  if (timeout === undefined || timeout === null) return;
  if (typeof timeout !== "number")
    throw new Error("config.timeout must be a number");
  if (timeout < 1) throw new Error("config.timeout must be at least 1 second");
  if (maxTimeout && timeout > maxTimeout)
    throw new Error(`config.timeout cannot be more than ${maxTimeout} seconds`);
}

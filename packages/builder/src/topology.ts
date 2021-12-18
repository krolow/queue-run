import { loadModule, QueueConfig, QueueHandler } from "@queue-run/runtime";
import chalk from "chalk";
import glob from "fast-glob";
import path from "path";
import invariant from "tiny-invariant";

export type Topology = {
  queues: Route<QueueConfig>;
  routes: Route;
};

export async function loadTopology(targetDir: string): Promise<Topology> {
  const cwd = process.cwd();
  process.chdir(targetDir);
  try {
    const routes = await mapRoutes();
    const queues = await mapQueues();
    return { queues, routes };
  } finally {
    process.chdir(cwd);
  }
}

export async function showTopology({ queues, routes }: Topology) {
  const displayRoutes = routes.displayFlat();
  console.info(
    chalk.bold.blue("λ: %s"),
    displayRoutes.length > 0 ? "API:" : "No routes"
  );
  console.info("%s", displayRoutes.map((line) => `   ${line}`).join("\n"));

  const displayQueues = queues.displayFlat();
  console.info(
    chalk.bold.blue("λ: %s:"),
    displayQueues.length > 0 ? "Queues" : "No queues"
  );
  console.info("%s", displayQueues.map((line) => `   ${line}`).join("\n"));
}

async function mapRoutes(): Promise<Topology["routes"]> {
  const filenames = await glob("api/**/[!_]*.js");
  const routes = new Route("/");
  for (const filename of filenames) {
    const module = await loadModule<() => void, { timeout?: number }>(filename);
    invariant(module, `Module ${filename} not found`);

    const { timeout } = module.config;
    validateTimeout(timeout, 30);

    routes.add(pathFromFilename(filename), filename, module.config);
  }
  return routes;
}

function pathFromFilename(filename: string): string {
  const basename = path.basename(filename, path.extname(filename));
  const directory = path.dirname(filename).replace("api/", "");
  return basename === "index" ? directory : `${directory}/${basename}`;
}

async function mapQueues(): Promise<Topology["queues"]> {
  const filenames = await glob("queues/[!_]*.js");
  const queues = new Route<QueueConfig>("queue");
  for (const filename of filenames) {
    const module = await loadModule<QueueHandler, QueueConfig>(filename);
    invariant(module, `Module ${filename} not found`);

    const { timeout } = module.config;
    // Maximum Lambda execution time
    validateTimeout(timeout, 900);

    queues.add(queueFromFilename(filename), filename, module.config);
  }
  return queues;
}

function queueFromFilename(queueName: string): string {
  const basename = path.basename(queueName, path.extname(queueName));
  const isFifo = basename.endsWith(".fifo");
  return isFifo ? `queue/${basename}/$group` : `queue/${basename}`;
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

class Route<Config = {}> {
  path: string;
  regex: RegExp;
  param?: string;
  children: Record<string, Route>;
  filename?: string;
  config?: Config;

  constructor(path: string, filename?: string, config?: Config) {
    this.path = path;
    this.children = {};
    this.regex = new RegExp(path);
    this.param = undefined;
    this.filename = filename;
    this.config = config;
  }

  count(): number {
    const self = this.filename ? 1 : 0;
    return Object.values(this.children).reduce(
      (sum, route) => sum + route.count(),
      self
    );
  }

  add(path: string, filename: string, config: Config) {
    const [base, ...rest] = path.split("/");
    invariant(base, "Invalid path");

    if (rest.length === 0) {
      const child = this.children[base] || new Route(base);
      this.children[base] = child;
      child.filename = filename;
      child.config = config;
    } else {
      const child = this.children[base] || new Route(base);
      this.children[base] = child;
      child.add(rest.join("/"), filename, config);
    }
  }

  displayTree(): string[] {
    return this._displayTree().slice(1);
  }

  _displayTree(): string[] {
    const nested = Object.values(this.children)
      .map((route, i, all) => {
        const last = i === all.length - 1;
        const [first, ...rest] = route._displayTree();
        return last
          ? [`└── ${first}`, ...rest.map((line) => `    ${line}`)]
          : [`├── ${first}`, ...rest.map((line) => `│   ${line}`)];
      })
      .flat();
    const self = this.filename ? `${this.path} → ${this.filename}` : this.path;
    return [self, ...nested];
  }

  displayFlat(): string[] {
    const nested = Object.values(this.children)
      .map((route) => route._displayFlat())
      .flat() as [string, string][];
    const width = Math.max(...nested.map(([path]) => path.length));
    return nested
      .map(([path, filename]) => path.padEnd(width, " ") + ` → ${filename}`)
      .sort();
  }

  _displayFlat(): [string, string][] {
    const nested = Object.values(this.children)
      .map((route) =>
        route
          ._displayFlat()
          .map(([path, filename]) => [`${this.path}/${path}`, filename])
      )
      .flat() as [string, string][];
    return this.filename ? [[this.path, this.filename], ...nested] : nested;
  }
}

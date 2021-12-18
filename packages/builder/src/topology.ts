import { loadModule, QueueConfig, QueueHandler } from "@queue-run/runtime";
import chalk from "chalk";
import glob from "fast-glob";
import invariant from "tiny-invariant";

export type Topology = {
  queues: Map<string, QueueConfig>;
  routes: Map<string, {}>;
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
  console.info(
    chalk.bold.blue("λ: %s:"),
    routes.size > 0 ? "API:" : "No routes"
  );
  Array.from(routes.keys()).forEach((name, i, all) => {
    const last = i === all.length - 1;
    console.info("   %s %s", last ? "⎣" : "⎜", name);
  });

  console.info(
    chalk.bold.blue("λ: %s:"),
    queues.size > 0 ? "Queues" : "No queues"
  );
  Array.from(queues.keys()).forEach((name, i, all) => {
    const last = i === all.length - 1;
    console.info("   %s %s", last ? "⎣" : "⎜", name);
  });
}

async function mapRoutes(): Promise<Topology["routes"]> {
  const filenames = await glob("api/**/[!_]*.js");
  const routes = new Map();
  for (const filename of filenames) {
    const module = await loadModule<() => void, { timeout?: number }>(filename);
    invariant(module, `Module ${filename} not found`);

    const { timeout } = module.config;
    validateTimeout(timeout, 30);

    routes.set(filename, module.config);
  }
  return routes;
}

async function mapQueues(): Promise<Topology["queues"]> {
  const filenames = await glob("queues/[!_]*.js");
  const queues = new Map();
  for (const filename of filenames) {
    const module = await loadModule<QueueHandler, QueueConfig>(filename);
    invariant(module, `Module ${filename} not found`);

    const { timeout } = module.config;
    // Maximum Lambda execution time
    validateTimeout(timeout, 900);

    queues.set(filename, module.config);
  }
  return queues;
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

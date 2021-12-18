import { loadModule, QueueConfig, QueueHandler } from "@queue-run/runtime";
import glob from "fast-glob";
import invariant from "tiny-invariant";

export type Topology = {
  queues: Map<string, QueueConfig>;
};

export async function loadTopology(
  targetDir: string
): Promise<{ queues: Map<string, QueueConfig> }> {
  let queues;

  const cwd = process.cwd();
  process.chdir(targetDir);
  try {
    queues = await mapQueues();
  } finally {
    process.chdir(cwd);
  }

  return { queues };
}

export async function showTopology({
  queues,
}: {
  queues: Map<string, QueueConfig>;
}): Promise<void> {
  if (queues.size > 0) {
    console.info("λ: Queues:");
    Array.from(queues.keys()).forEach((name, i, all) => {
      const last = i === all.length - 1;
      console.info("   %s %s", last ? "⎣" : "⎜", name);
    });
  } else console.info("No queues");
}

async function mapQueues(): Promise<Map<string, QueueConfig>> {
  const filenames = await glob("queues/[!_]*.js");
  const queues = new Map();
  for (const filename of filenames) {
    const module = await loadModule<QueueHandler, QueueConfig>(filename);
    invariant(module, `Module ${filename} not found`);

    if (module.handler.length === 0)
      throw new Error(`Module ${filename} exports a handler with no arguments`);

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

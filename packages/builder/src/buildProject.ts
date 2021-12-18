import Lambda from "@aws-sdk/client-lambda";
import { loadModule, QueueConfig, QueueHandler } from "@queue-run/runtime";
import glob from "fast-glob";
import invariant from "tiny-invariant";
import compileSourceFiles from "./compileSourceFiles";
import createBuildDirectory from "./createBuildDirectory";
import createZip from "./createZip";
import getRuntime from "./getRuntime";
import installDependencies from "./installDependencies";

// Short build: compile source files to target directory.
//
// Full build: also install node modules, create and return a Zip.
// May return undefined if build aborted by signal.
export default async function buildProject({
  full,
  signal,
  sourceDir,
  targetDir,
}: {
  full?: boolean;
  signal?: AbortSignal;
  sourceDir: string;
  targetDir: string;
}): Promise<{
  lambdaRuntime: Lambda.Runtime;
  queues: Map<string, QueueConfig>;
  zip?: Uint8Array;
}> {
  const { lambdaRuntime } = await getRuntime(sourceDir);
  await createBuildDirectory(targetDir);

  await compileSourceFiles({ sourceDir, targetDir });
  if (signal?.aborted) throw new Error();

  if (full) await installDependencies({ sourceDir, targetDir });
  if (signal?.aborted) throw new Error();

  const zip = full ? await createZip(targetDir) : undefined;
  if (signal?.aborted) throw new Error();

  const { queues } = await loadTopology(targetDir);

  return { lambdaRuntime, queues, zip };
}

async function loadTopology(
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

  if (queues.size > 0) {
    console.info("λ: Queues:");
    Array.from(queues.keys()).forEach((name, i, all) => {
      const last = i === all.length - 1;
      console.info("   %s %s", last ? "⎣" : "⎜", name);
    });
  } else console.info("No queues");

  return { queues };
}

async function mapQueues(): Promise<Map<string, QueueConfig>> {
  const filenames = await glob("queue/[!_]*.js");
  const queues = new Map();
  for (const filename of filenames) {
    const module = await loadModule<QueueHandler, QueueConfig>(filename);
    invariant(module, `Module ${filename} not found`);

    if (module.handler.length === 0)
      throw new Error(`Module ${filename} exports a handler with no arguments`);

    const { timeout } = module.config;
    if (timeout !== undefined) {
      if (typeof timeout !== "number")
        throw new Error(`Module ${filename} timeout must be a number`);
      if (timeout < 1)
        throw new Error(`Module ${filename} timeout must be at least 1`);
    }
    queues.set(filename, module.config);
  }
  return queues;
}

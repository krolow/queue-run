import fs from "node:fs/promises";
import ora from "ora";
import type { BackendConfig, BackendExports } from "queue-run";
import { loadModule, Manifest } from "queue-run";
import compileSourceFiles from "./compileSourceFiles.js";
import createBuildDirectory from "./createBuildDirectory.js";
import getRuntime from "./getRuntime.js";
import installDependencies from "./installDependencies.js";
import mapQueues from "./mapQueues.js";
import mapRoutes from "./mapRoutes.js";
import mapSocket from "./mapSocket.js";
import zipLambda from "./zipLambda.js";

// Short build: compile source files to target directory.
//
// Full build: also install node modules, create and return a Zip.
// May return undefined if build aborted by signal.
export default async function buildProject({
  // Build into this directory, .queue-run from CLI, temp dir on AWS
  buildDir,
  // Full build - install node modules, and create Zip
  // Partial build — only compile source files and show available routes/services
  full,
  // Build server can use this to terminate builds early
  signal,
  // Directory with the source files, current directory from CLI, or temp dir on AWS
  sourceDir,
}: {
  buildDir: string;
  full?: boolean;
  signal?: AbortSignal;
  sourceDir: string;
}): Promise<{
  lambdaRuntime: string;
  manifest: Manifest;
  zip: Uint8Array | undefined;
}> {
  const { lambdaRuntime } = await getRuntime(sourceDir);
  await createBuildDirectory(buildDir);

  await compileSourceFiles({ sourceDir, targetDir: buildDir });
  if (signal?.aborted) throw new Error();

  if (full) await installDependencies({ sourceDir, targetDir: buildDir });
  if (signal?.aborted) throw new Error();

  const manifest = await createManifest(buildDir);
  if (signal?.aborted) throw new Error();

  const zip = full ? await zipLambda(buildDir) : undefined;
  if (signal?.aborted) throw new Error();

  return { lambdaRuntime, manifest, zip };
}

async function createManifest(dirname: string) {
  const spinner = ora("Creating manifest …").start();
  const cwd = process.cwd();
  try {
    process.chdir(dirname);

    const routes = await mapRoutes();
    const socket = await mapSocket();
    const queues = await mapQueues();
    const config = (await loadModule<BackendExports, never>("index"))?.module
      .config;

    const limits = {
      memory: getMemory({ config, queues, routes, socket }),
      timeout: getTimeout({ config, queues, routes, socket }),
    };

    const manifest: Manifest = { limits, queues, routes, socket };
    await fs.writeFile("manifest.json", JSON.stringify(manifest), "utf-8");
    spinner.succeed("Created manifest");

    if (manifest.routes.length === 0) {
      console.warn(
        'No routes found. Add "export default async function () { … }" to your routes.'
      );
    }
    return manifest;
  } finally {
    process.chdir(cwd);
  }
}

function getTimeout({
  queues,
  routes,
  socket,
}: {
  config: BackendConfig | undefined;
  queues: Manifest["queues"];
  routes: Manifest["routes"];
  socket: Manifest["socket"];
}) {
  return Math.max(
    ...Array.from(queues.values()).map((queue) => queue.timeout),
    ...Array.from(routes.values()).map((route) => route.timeout),
    ...Array.from(socket.values()).map((socket) => socket.timeout)
  );
}

function getMemory({
  config,
}: {
  config: BackendConfig | undefined;
  queues: Manifest["queues"];
  routes: Manifest["routes"];
  socket: Manifest["socket"];
}) {
  const memory = config?.memory ?? 128;
  if (typeof memory === "number") return memory;
  const match = memory.trim().match(/^(\d+)\s*([MG]B?)$/i);
  if (!match) throw new Error(`Invalid memory limit: ${memory}`);
  const [, amount, unit] = match;
  return unit === "GB" || unit === "G"
    ? parseFloat(amount!) * 1000
    : parseInt(amount!);
}

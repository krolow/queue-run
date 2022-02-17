import fs from "node:fs/promises";
import ora from "ora";
import type { BackendExports, Manifest } from "queue-run";
import { loadModule, writeManifest } from "queue-run";
import compileSourceFiles from "./compile_source_files.js";
import getRuntime from "./get_runtime.js";
import installDependencies from "./install_dependencies.js";
import mapQueues from "./map_queues.js";
import mapRoutes from "./map_routes.js";
import mapSchedules from "./map_schedules.js";
import mapSocket from "./map_socket.js";
import zipLambda from "./zip_lambda.js";

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
  await fs.rm(buildDir, { force: true, recursive: true });
  await fs.mkdir(buildDir);

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
  const spinner = ora("Creating manifest").start();
  const cwd = process.cwd();
  try {
    process.chdir(dirname);

    const routes = await mapRoutes();
    const socket = await mapSocket();
    const queues = await mapQueues();
    const schedules = await mapSchedules();
    const config = (await loadModule<BackendExports, never>("index"))?.module
      .config;

    const manifest = await writeManifest({
      config,
      queues,
      routes,
      schedules,
      socket,
    });
    spinner.succeed("Created manifest");
    return manifest;
  } finally {
    process.chdir(cwd);
  }
}

import fs from "node:fs/promises";
import ora from "ora";
import { Manifest } from "queue-run";
import compileSourceFiles from "./compileSourceFiles.js";
import createBuildDirectory from "./createBuildDirectory.js";
import getRuntime from "./getRuntime.js";
import installDependencies from "./installDependencies.js";
import mapQueues from "./mapQueues.js";
import mapRoutes from "./mapRoutes.js";
import mapSockets from "./mapSockets.js";
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

  const spinner = ora("Creating manifest …").start();
  const manifest = await createManifest(buildDir);
  spinner.stop();

  const zip = full ? await zipLambda(buildDir) : undefined;
  if (signal?.aborted) throw new Error();

  return { lambdaRuntime, manifest, zip };
}

async function createManifest(dirname: string) {
  const cwd = process.cwd();
  try {
    process.chdir(dirname);
    const routes = await mapRoutes();
    const sockets = await mapSockets();
    const queues = await mapQueues();
    const manifest: Manifest = { queues, routes, sockets };
    await fs.writeFile("manifest.json", JSON.stringify(manifest), "utf-8");
    return manifest;
  } finally {
    process.chdir(cwd);
  }
}

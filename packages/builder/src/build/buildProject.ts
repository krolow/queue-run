import fs from "fs/promises";
import ora from "ora";
import { loadQueues, loadRoutes, Manifest } from "queue-run";
import compileSourceFiles from "./compileSourceFiles";
import createBuildDirectory from "./createBuildDirectory";
import getRuntime from "./getRuntime";
import installDependencies from "./installDependencies";
import zipLambda from "./zipLambda";

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
    const routes = await loadRoutes();
    const queues = await loadQueues();
    const manifest: Manifest = {
      queues: Array.from(queues.values()),
      routes: Array.from(routes.entries()).map(
        ([route, { accepts, cors, methods, filename, timeout }]) => ({
          path: route,
          accepts: Array.from(accepts.keys()),
          cors,
          methods: Array.from(methods.keys()),
          filename,
          timeout,
        })
      ),
    };
    await fs.writeFile("manifest.json", JSON.stringify(manifest), "utf-8");
    return manifest;
  } finally {
    process.chdir(cwd);
  }
}

import Lambda from "@aws-sdk/client-lambda";
import { displayServices, loadServices, Services } from "@queue-run/runtime";
import ora from "ora";
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
  buildDir,
  full,
  signal,
  sourceDir,
}: {
  buildDir: string;
  full?: boolean;
  signal?: AbortSignal;
  sourceDir: string;
}): Promise<
  {
    lambdaRuntime: Lambda.Runtime;
    zip?: Uint8Array;
  } & Services
> {
  const { lambdaRuntime } = await getRuntime(sourceDir);
  await createBuildDirectory(buildDir);

  await compileSourceFiles({ sourceDir, targetDir: buildDir });
  if (signal?.aborted) throw new Error();

  if (full) await installDependencies({ sourceDir, targetDir: buildDir });
  if (signal?.aborted) throw new Error();

  const spinner = ora("Reviewing endpoints …").start();
  let services;
  try {
    services = await loadServices(buildDir);
    if (services.routes.size + services.queues.size === 0)
      throw new Error("No API endpoints, queues, or schedules");
  } finally {
    spinner.stop();
  }

  const zip = full ? await zipLambda(buildDir) : undefined;
  if (signal?.aborted) throw new Error();

  displayServices(services);
  return { lambdaRuntime, zip, ...services };
}

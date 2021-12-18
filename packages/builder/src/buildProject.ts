import Lambda from "@aws-sdk/client-lambda";
import { QueueConfig } from "@queue-run/runtime";
import compileSourceFiles from "./compileSourceFiles";
import createBuildDirectory from "./createBuildDirectory";
import createZip from "./createZip";
import getRuntime from "./getRuntime";
import installDependencies from "./installDependencies";
import { loadTopology, showTopology } from "./topology";

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

  const topology = await loadTopology(targetDir);
  if (topology.queues.size === 0)
    throw new Error("No API endpoints, queues, or schedules");
  showTopology(topology);

  return { lambdaRuntime, zip, ...topology };
}

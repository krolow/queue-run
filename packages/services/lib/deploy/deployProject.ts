import Lambda from "@aws-sdk/client-lambda";
import { buildProject } from "@queue-run/builder";
import ms from "ms";
import invariant from "tiny-invariant";
import { addTriggers, removeTriggers } from "./eventSource";
import { createQueues, deleteOldQueues } from "./prepareQueues";
import { Deploy } from "./state";
import updateAlias from "./updateAlias";
import uploadLambda from "./uploadLambda";
import withBuildDirs from "./withBuildDirs";

export default async function deployProject({
  archive,
  deploy,
  signal,
}: {
  archive: Buffer;
  deploy: Deploy;
  signal: AbortSignal;
}) {
  const start = Date.now();
  console.info("🐇 Starting deploy %s", deploy.id);

  const { lambdaRuntime, queues, zip } = await withBuildDirs(
    { archive, signal },
    async ({ sourceDir, targetDir }) =>
      await buildProject({
        full: true,
        signal,
        sourceDir,
        targetDir,
      })
  );
  if (signal.aborted) throw new Error();

  const lambdaName = `backend-${deploy.projectId}`;
  const queuePrefix = `${deploy.projectId}-${deploy.branchId}__`;
  const lambdaAlias = `${lambdaName}-${deploy.branchId}`;
  const lambdaTimeout = 30;
  const queueTimeout = lambdaTimeout * 6;

  const versionARN = await prepareLambda({
    envVars: {
      NODE_ENV: "production",
      QUEUE_RUN_PROJECT: deploy.projectId,
      QUEUE_RUN_BRANCH: deploy.branchId,
    },
    lambdaName,
    lambdaRuntime,
    zip,
  });
  if (signal.aborted) throw new Error();

  // From this point on, we hope to complete successfully and so ignore abort signal
  await switchOver({
    lambdaAlias,
    queues,
    queuePrefix,
    versionARN,
    queueTimeout,
  });

  console.info("🐇 Done in %s", ms(Date.now() - start));
}

async function prepareLambda({
  envVars,
  lambdaName,
  lambdaRuntime,
  zip,
}: {
  envVars: Record<string, string>;
  lambdaName: string;
  lambdaRuntime: Lambda.Runtime;
  zip: Uint8Array;
}) {
  const lambdaTimeout = 30;
  // Upload new Lambda function and publish a new version.
  // This doesn't make any difference yet: event sources are tied to an alias,
  // and the alias points to an earlier version (or no version on first deploy).
  const versionARN = await uploadLambda({
    envVars,
    lambdaName,
    lambdaTimeout,
    lambdaRuntime,
    zip,
  });
  // goose-bump:50 => goose-bump:goose-bump-main
  const version = versionARN.match(/(\d)+$/)?.[1];
  invariant(version);
  return versionARN;
}

async function switchOver({
  lambdaAlias,
  queues,
  queuePrefix,
  versionARN,
  queueTimeout,
}: {
  lambdaAlias: string;
  queuePrefix: string;
  queues: string[];
  versionARN: string;
  queueTimeout: number;
}) {
  const aliasARN = versionARN.replace(/(\d+)$/, lambdaAlias);

  // Create queues that new version expects, and remove triggers for event
  // sources that new version does not understand.
  const queueARNs = await createQueues({
    queues,
    prefix: queuePrefix,
    queueTimeout,
  });

  await removeTriggers({ lambdaARN: aliasARN, sourceARNs: queueARNs });

  // Update alias to point to new version.
  //
  // The alias includes the branch name, so if you parallel deploy in two
  // branches, you would have two aliases pointing to two different published
  // versions:
  //
  //    {projectId}-{branch} => {projectId}:{version}
  await updateAlias({ aliasARN, versionARN });

  // Add triggers for queues that new version can handle.  We do that for the
  // alias, so we only need to add new triggers, existing triggers carry over:
  //
  //   trigger {projectId}-{branch}__{queueName} => {projectId}-{branch}
  await addTriggers({ lambdaARN: aliasARN, sourceARNs: queueARNs });
  console.info(
    "λ: Using %s version %s",
    aliasARN.split(":").slice(-1),
    versionARN.split(":").slice(-1)
  );

  // Delete any queues that are no longer needed.
  await deleteOldQueues({ prefix: queuePrefix, queueARNs });
}

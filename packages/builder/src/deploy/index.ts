import { DynamoDB } from "@aws-sdk/client-dynamodb";
import Lambda from "@aws-sdk/client-lambda";
import { Services } from "@queue-run/runtime";
import ms from "ms";
import os from "os";
import ow from "ow";
import path from "path";
import invariant from "tiny-invariant";
import buildProject from "../build";
import { addTriggers, removeTriggers } from "./eventSource";
import { createQueues, deleteOldQueues } from "./prepareQueues";
import updateAlias from "./updateAlias";
import uploadLambda from "./uploadLambda";

type BuildConfig = {
  // The project ID, eg "goose-bump".
  projectId: string;
  // Lambda name, eg backend-${projectId}
  lambdaName: string;
  // URL slug, eg ${projectId}-${branch}
  slug: string;
  // Full URL, eg https://${slug}.queue.run
  url: string;
  // True for production, false for preview
  production: boolean;
  // ARN for the layer containing @queue-run/runtime
  runtimeLayerARN: string;
};

export default async function deployProject({
  config,
  deployId,
  signal,
  sourceDir,
}: {
  config: BuildConfig;
  deployId: string;
  signal: AbortSignal;
  sourceDir: string;
}) {
  const { lambdaName, slug } = config;
  ow(lambdaName, ow.string.matches(/^[a-zA-Z0-9-]+$/));
  ow(slug, ow.string.matches(/^[a-zA-Z0-9-]+$/));
  ow(config.url, ow.string.url);

  const start = Date.now();
  console.info("🐇 Starting deploy", deployId);

  const targetDir = path.join(os.tmpdir(), ".build");
  const { lambdaRuntime, zip, routes, queues } = await buildProject({
    full: true,
    signal,
    sourceDir,
    targetDir,
  });
  invariant(zip);
  if (signal.aborted) throw new Error();

  const queuePrefix = `${config.slug}__`;
  const lambdaAlias = config.slug;
  const lambdaTimeout = Math.max(
    ...Array.from(queues.values()).map((queue) => queue.timeout),
    ...Array.from(routes.values()).map((route) => route.timeout)
  );

  // TODO load environment variables from database
  const envVars = {
    NODE_ENV: "production",
    QUEUE_RUN_URL: config.url,
    QUEUE_RUN_ENV: config.production ? "production" : "preview",
  };

  const versionARN = await prepareLambda({
    envVars,
    lambdaName,
    lambdaRuntime,
    lambdaTimeout,
    layerARNs: [config.runtimeLayerARN],
    zip,
  });
  if (signal.aborted) throw new Error();

  // From this point on, we hope to complete successfully and so ignore abort signal
  await switchOver({
    lambdaAlias,
    queues,
    queuePrefix,
    versionARN,
  });

  const dynamoDB = new DynamoDB({});
  try {
    await dynamoDB.executeStatement({
      Statement: `INSERT INTO queue-run-backends VALUES {'slug': ?, 'project_id': ?, 'lambda_name': ?, 'created_at': ?}`,
      Parameters: [
        { S: config.slug },
        { S: config.projectId },
        { S: config.lambdaName },
        { N: String(Date.now()) },
      ],
    });
  } catch (error) {
    if (error instanceof Error && error.name === "DuplicateItemException")
      return;
    else throw error;
  }

  console.info("🐇 Done in %s", ms(Date.now() - start));
}

async function prepareLambda({
  envVars,
  lambdaName,
  lambdaRuntime,
  lambdaTimeout,
  layerARNs,
  zip,
}: {
  envVars: Record<string, string>;
  lambdaName: string;
  lambdaRuntime: Lambda.Runtime;
  lambdaTimeout: number;
  layerARNs: string[];
  zip: Uint8Array;
}) {
  // Upload new Lambda function and publish a new version.
  // This doesn't make any difference yet: event sources are tied to an alias,
  // and the alias points to an earlier version (or no version on first deploy).
  const versionARN = await uploadLambda({
    envVars,
    lambdaName,
    lambdaTimeout,
    lambdaRuntime,
    layerARNs,
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
}: {
  lambdaAlias: string;
  queuePrefix: string;
  queues: Services["queues"];
  versionARN: string;
}) {
  const aliasARN = versionARN.replace(/(\d+)$/, lambdaAlias);

  // Create queues that new version expects, and remove triggers for event
  // sources that new version does not understand.
  const queueARNs = await createQueues({
    queues,
    prefix: queuePrefix,
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

import { DynamoDB } from "@aws-sdk/client-dynamodb";
import { Services } from "@queue-run/runtime";
import ow from "ow";
import invariant from "tiny-invariant";
import { URL } from "url";
import buildProject from "../build";
import { addTriggers, removeTriggers } from "./eventSource";
import { createQueues, deleteOldQueues } from "./prepareQueues";
import updateAlias from "./updateAlias";
import uploadLambda from "./uploadLambda";

type BuildConfig = {
  // Misc environment variables to add
  envVars?: Record<string, string>;

  // This prefix is used in Lambda names, IAM roles, SQS queues, DynamoDB
  // tables, etc to distinguish from other resources in your AWS account. Use the
  // same prefix for all projects in the same AWS account. Use slugs to distinguish
  // between projects/branches.
  //
  // Limited to 10 characters and must end with a dash. Defaults to 'qr-.
  prefix?: string | "qr-";

  // True when deploying to production, false for preview.
  //
  // This determines which sercets to use as environment variables, and sets
  // QUEUE_RUN_ENV.
  production: boolean;

  // The slug is used as the Lambda name, SQS queue prefix, etc to distinguish
  // resources for a single project/branch.  The slug can also be used in the URL.
  //
  // Limited to 40 characters (a-z, 0-9, -).  Undescores are not allowed.
  slug: string;

  // The full URL for this backend, eg https://${slug}.queue.run
  // Available to the backed as QUEUE_RUN_URL.
  url: string;

  // ARNs for layers you want to include in the Lambda.
  // The runtime is included by default, but you can use this to choose a
  // different version.
  layerARNs?: string[];
};

const defaultPrefix = "qr-";

export default async function deployProject({
  config,
  signal,
  sourceDir,
}: {
  config: BuildConfig;
  signal?: AbortSignal;
  sourceDir: string;
}) {
  const { prefix = defaultPrefix, slug } = config;
  ow(
    prefix,
    ow.string
      .matches(/^[a-z0-9_-]+-$/i)
      .message("Prefix must be [a-z0-9_-] and end with a hyphen")
      .maxLength(10)
      .message("Prefix must be 10 characters or less")
  );
  ow(
    slug,
    ow.string
      .matches(/^[a-z0-9-]{5,40}$/i)
      .message("Slug must be [a-z0-9-] and 5-40 characters long")
  );
  const { hostname } = new URL(config.url);

  console.info("🐇 Starting deploy");

  const { lambdaRuntime, zip, routes, queues } = await buildProject({
    full: true,
    signal,
    sourceDir,
  });
  invariant(zip);
  if (signal?.aborted) throw new Error("Timeout");

  const lambdaName = `${prefix}${slug}`;
  const queuePrefix = `${prefix}${slug}__`;
  const lambdaTimeout = Math.max(
    ...Array.from(queues.values()).map((queue) => queue.timeout),
    ...Array.from(routes.values()).map((route) => route.timeout)
  );
  const lambdaAlias = "current";

  // TODO load environment variables from database
  const envVars = {
    ...config.envVars,
    NODE_ENV: "production",
    QUEUE_RUN_URL: config.url,
    QUEUE_RUN_ENV: config.production ? "production" : "preview",
  };

  // Upload new Lambda function and publish a new version.
  // This doesn't make any difference yet: event sources are tied to an alias,
  // and the alias points to an earlier version (or no version on first deploy).
  const versionARN = await uploadLambda({
    envVars,
    lambdaName,
    lambdaTimeout,
    lambdaRuntime,
    layerARNs: config.layerARNs,
    zip,
  });
  // goose-bump:50 => goose-bump:goose-bump-main
  const version = versionARN.match(/(\d)+$/)?.[1];
  invariant(version);
  if (signal?.aborted) throw new Error();

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
      Statement: `INSERT INTO ${prefix}-backends VALUES {'hostname': ?, 'lambda_name': ?, 'created_at': ?}`,
      Parameters: [
        { S: hostname },
        { S: lambdaName },
        { N: String(Date.now()) },
      ],
    });
  } catch (error) {
    if (error instanceof Error && error.name === "DuplicateItemException")
      return;
    else throw error;
  }
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

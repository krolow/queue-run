import { Lambda } from "@aws-sdk/client-lambda";
import { Services } from "@queue-run/runtime";
import chalk from "chalk";
import ow from "ow";
import invariant from "tiny-invariant";
import buildProject from "../build";
import { addTriggers, removeTriggers } from "./eventSource";
import { createQueues, deleteOldQueues } from "./prepareQueues";
import updateAlias from "./updateAlias";
import uploadLambda from "./uploadLambda";

type BuildConfig = {
  env: "production" | "preview";

  // Misc environment variables to add
  envVars?: Record<string, string>;

  // The slug is used as the Lambda function name, queue prefix name, etc.
  // Limited to 40 characters, alphanumeric, and dashes, eg "my-project-pr-13".
  // It should be unique for each project/branch.
  slug: string;

  // The full URL for this backend. Available to the backed as the environment
  // variable QUEUE_RUN_URL.
  //
  // If not specified, uses the template: https://${slug}.queue.run
  url?: string;

  // ARNs for layers you want to include in the Lambda.
  //
  // The Runtime is included by default, but you can use this to choose a
  // different version.
  layerARNs?: string[];
};

// This prefix is used in Lambda names, IAM roles, SQS queues, DynamoDB tables,
// etc to distinguish from other resources in your AWS account.
//
// Use the same prefix for all projects in the same AWS account. Use slugs to
// distinguish between projects/branches.
//
// Limited to 10 characters and must end with a dash. Defaults to 'qr-.

export default async function deployLambda({
  buildDir,
  config,
  signal,
  sourceDir,
}: {
  buildDir: string;
  config: BuildConfig;
  signal?: AbortSignal;
  sourceDir: string;
}): Promise<string> {
  const { slug } = config;

  // Note: queue names have 80 characters limit, when we combine
  // {qrPrefix}{project}_{branch}__{queueName} we have a total of 27 characters
  // available.

  ow(
    slug,
    ow.optional.string
      .matches(/^[a-zA-Z0-9-]{1,40}$/)
      .message("Slug must be 40 characters or less, alphanumeric and dashes")
  );

  const url = config.url ?? `https://${slug}.queue.run`;
  ow(url, ow.string.url);

  const lambdaName = `qr-${slug}`;
  const queuePrefix = `${lambdaName}__`;

  console.info(chalk.bold.green("🐇 Deploying %s to %s"), slug, url);

  const { lambdaRuntime, zip, ...services } = await buildProject({
    buildDir,
    full: true,
    signal,
    sourceDir,
  });
  invariant(zip);
  if (signal?.aborted) throw new Error("Timeout");

  console.info(chalk.bold.blue("λ: Deploying Lambda function and queues"));

  const envVars = await loadEnvVars({
    envVars: config.envVars,
    environment: config.env,
    url,
  });

  if (signal?.aborted) throw new Error();

  // Upload new Lambda function and publish a new version.
  // This doesn't make any difference yet: event sources are tied to an alias,
  // and the alias points to an earlier version (or no version on first deploy).
  const versionARN = await uploadLambda({
    envVars,
    lambdaName,
    lambdaTimeout: getLambdaTimeout(services),
    lambdaRuntime,
    layerARNs: config.layerARNs,
    zip,
  });

  if (signal?.aborted) throw new Error();

  // From this point on, we hope to complete successfully and so ignore abort signal
  return await switchOver({
    queues: services.queues,
    queuePrefix,
    versionARN,
  });
}

async function loadEnvVars({
  environment,
  envVars,
  url,
}: {
  environment: "production" | "preview";
  envVars?: Record<string, string>;
  url: string;
}) {
  // TODO load environment variables from database
  return {
    ...envVars,
    NODE_ENV: "production",
    QUEUE_RUN_URL: url,
    QUEUE_RUN_ENV: environment,
  };
}

function getLambdaTimeout(services: Services) {
  return Math.max(
    ...Array.from(services.queues.values()).map((queue) => queue.timeout),
    ...Array.from(services.routes.values()).map((route) => route.timeout)
  );
}

async function switchOver({
  queues,
  queuePrefix,
  versionARN,
}: {
  queuePrefix: string;
  queues: Services["queues"];
  versionARN: string;
}): Promise<string> {
  const aliasARN = versionARN.replace(/(\d+)$/, "latest");

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
  console.info("   This is version %s", versionARN.split(":").slice(-1)[0]);

  // Delete any queues that are no longer needed.
  await deleteOldQueues({ prefix: queuePrefix, queueARNs });

  // Delete old versions (excluding this one and $LATEST)
  await deleteOldVersions(versionARN);

  return aliasARN;
}

async function deleteOldVersions(versionARN: string) {
  const lambda = new Lambda({});
  const { Versions: versions } = await lambda.listVersionsByFunction({
    FunctionName: versionARN.replace(/:\d+$/, ""),
  });
  invariant(versions);
  const obsolete = versions
    .filter(({ Version }) => Version !== "$LATEST")
    .filter(({ FunctionArn }) => FunctionArn !== versionARN)
    .map(({ FunctionArn }) => FunctionArn);
  await Promise.all(
    obsolete.map((arn) => lambda.deleteFunction({ FunctionName: arn }))
  );
}

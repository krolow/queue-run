import { DynamoDB } from "@aws-sdk/client-dynamodb";
import { Services } from "@queue-run/runtime";
import chalk from "chalk";
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

  // Project name.  Two words separated by dash, limited to 20 characters, lower
  // case, eg "grumpy-sunshine".
  project: string;

  // Branch name.  Limited to 20 characters, alphanumeric, and dashes, eg
  // "pr-123".
  //
  // If specified, this is a preview deployment, otherwise production.
  branch?: string;

  // The full URL for this backend. Available to the backed as the environment
  // variable QUEUE_RUN_URL.
  //
  // If not specified, uses the template: https://${project-branch}.queue.run
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
const qrPrefix = "qr-";

export default async function deployProject({
  config,
  signal,
  sourceDir,
}: {
  config: BuildConfig;
  signal?: AbortSignal;
  sourceDir: string;
}) {
  const { branch, project } = config;

  // Note: queue names have 80 characters limit, when we combine
  // {qrPrefix}{project}_{branch}__{queueName} we have a total of 27 characters
  // available.

  ow(
    branch,
    ow.optional.string
      .matches(/^[a-z0-9-]{1,20}$/i)
      .message("Branch must be 20 characters or less, alphanumeric and dashes")
  );
  ow(
    project,
    ow.string
      .matches(/^[a-z]+-[a-z]+$/i)
      .message("Prefix must be two words separated by a dash")
      .maxLength(20)
      .message("Prefix must be 20 characters or less")
  );
  ow(
    qrPrefix,
    ow.string
      .matches(/^[a-z0-9_-]+-$/i)
      .message("Prefix must be [a-z0-9_-] and end with a hyphen")
      .maxLength(10)
      .message("Prefix must be 10 characters or less")
  );

  const url =
    config.url ??
    `https://${branch ? [project, branch].join("-") : project}.queue.run`;
  ow(url, ow.string.url);

  const lambdaName = `${qrPrefix}${project}`;
  const queuePrefix = branch ? `${lambdaName}_${branch}__` : `${lambdaName}__`;
  const lambdaAlias = branch ?? "_production";

  const backend = await getBackendRouting(url);
  if (backend && backend.project !== project && backend.branch !== branch)
    throw new Error("This URL is used by a different project/branch");

  console.info(
    chalk.bold.green("🐇 Deploying %s to %s"),
    branch ? `${project}:${branch}` : project,
    url
  );

  const { lambdaRuntime, zip, ...services } = await buildProject({
    full: true,
    signal,
    sourceDir,
  });
  invariant(zip);
  if (signal?.aborted) throw new Error("Timeout");

  console.info(chalk.bold.blue("λ: Deploying Lambda function and queues"));

  const envVars = await loadEnvVars({
    envVars: config.envVars,
    environment: branch ? "preview" : "production",
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
  const aliasARN = await switchOver({
    lambdaAlias,
    queues: services.queues,
    queuePrefix,
    versionARN,
  });
  await addBackendRouting({ aliasARN, project, url });
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
  lambdaAlias,
  queues,
  queuePrefix,
  versionARN,
}: {
  lambdaAlias: string;
  queuePrefix: string;
  queues: Services["queues"];
  versionARN: string;
}): Promise<string> {
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
  console.info("   This is version %s", versionARN.split(":").slice(-1)[0]);

  // Delete any queues that are no longer needed.
  await deleteOldQueues({ prefix: queuePrefix, queueARNs });
  return aliasARN;
}

async function addBackendRouting({
  aliasARN,
  branch,
  project,
  url,
}: {
  aliasARN: string;
  branch?: string;
  project: string;
  url: string;
}) {
  const { hostname } = new URL(url);
  const dynamoDB = new DynamoDB({});
  console.info("   Updated routing table");
  try {
    await dynamoDB.executeStatement({
      Statement: `INSERT INTO "${qrPrefix}backends" VALUE {'hostname': ?, 'project' : ?, 'branch': ?, 'lambda_arn': ?, 'created_at': ?}`,
      Parameters: [
        { S: hostname },
        { S: project },
        branch ? { S: branch } : { NULL: true },
        { S: aliasARN },
        { N: String(Date.now()) },
      ],
    });
  } catch (error) {
    if (error instanceof Error && error.name === "DuplicateItemException")
      return;
    else throw error;
  }
}

async function getBackendRouting(
  url: string
): Promise<{ project: string; branch?: string } | null> {
  const { hostname } = new URL(url);
  const dynamoDB = new DynamoDB({});
  const { Items: backends } = await dynamoDB.executeStatement({
    Statement: `SELECT * FROM "${qrPrefix}backends" WHERE hostname = ?`,
    Parameters: [{ S: hostname }],
  });
  const backend = backends?.[0];
  if (!backend) return null;

  console.info({ backend });

  const project = backend.project?.S;
  invariant(project);
  const branch = backend.branch?.S;
  return { project, branch };
}

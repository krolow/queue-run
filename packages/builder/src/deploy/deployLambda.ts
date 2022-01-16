import { Lambda } from "@aws-sdk/client-lambda";
import chalk from "chalk";
import dotenv from "dotenv";
import { AbortSignal } from "node-abort-controller";
import fs from "node:fs/promises";
import { debuglog } from "node:util";
import { Manifest } from "queue-run";
import invariant from "tiny-invariant";
import { buildProject, displayManifest } from "../build/index.js";
import { createTables } from "./createTables.js";
import { addTriggers, removeTriggers } from "./eventSource.js";
import { createQueues, deleteOldQueues } from "./prepareQueues.js";
import updateAlias from "./updateAlias.js";
import uploadLambda from "./uploadLambda.js";

type LambdaConfig = {
  /**  AWS account ID  */
  accountId: string;

  env: "production" | "preview";

  /**  Misc environment variables to add */
  envVars?: Record<string, string>;

  /** AWS region */
  region: string;

  /** The slug is used as the Lambda function name, queue prefix name, etc.
   *  Limited to 40 characters, alphanumeric, and dashes, eg "my-project-pr-13".
   *  It should be unique for each project/branch. */
  slug: string;

  /** The full URL for this backend's HTTP API. Available to the backed as the
   *  environment variable QUEUE_RUN_URL. */
  httpURL: string;

  /** The full URL for this backend's WebSocket. Available to the backed as the
   *  environment variable QUEUE_RUN_WS. */
  wsURL: string;

  /**  WebSocket Gateway API ID. */
  wsApiId: string;
};

const debug = debuglog("queue-run:deploy");

export default async function deployLambda({
  buildDir,
  config,
  signal = new AbortSignal(),
  sourceDir,
}: {
  buildDir: string;
  config: LambdaConfig;
  signal?: AbortSignal;
  sourceDir: string;
}): Promise<string> {
  const { slug } = config;

  // Note: queue names have 80 characters limit, when we combine
  // {qrPrefix}{project}_{branch}__{queueName} we have a total of 27 characters
  // available.

  if (!/^[a-zA-Z0-9-]{1,40}$/.test(slug))
    throw new Error(
      "Slug must be 40 characters or less, alphanumeric and dashes"
    );

  const { httpURL, wsURL } = config;
  if (!/^https:\/\//.test(httpURL))
    throw new Error('HTTP URL must start with "https://"');
  if (!/^wss:\/\//.test(wsURL))
    throw new Error('WS URL must start with "https://"');

  const lambdaName = `qr-${slug}`;
  debug('Lamba name: "%s"', lambdaName);
  const queuePrefix = `${lambdaName}__`;
  debug('Queue prefix: "%s"', queuePrefix);

  console.info(chalk.bold.green("🐇 Deploying %s to %s"), slug, httpURL);

  const { lambdaRuntime, zip, manifest } = await buildProject({
    buildDir,
    full: true,
    signal,
    sourceDir,
  });
  invariant(zip);
  if (signal?.aborted) throw new Error("Timeout");
  await displayManifest(buildDir);

  console.info("λ: Deploying Lambda function and queues");

  // DDB tables are referenced in the Lambda policy, so we need these to exist
  // before we can deploy.
  await createTables();
  if (signal?.aborted) throw new Error();

  const envVars = await loadEnvVars({
    envVars: config.envVars ?? {},
    environment: config.env,
    httpURL,
    wsURL,
  });

  if (signal?.aborted) throw new Error();

  // Upload new Lambda function and publish a new version.
  // This doesn't make any difference yet: event sources are tied to an alias,
  // and the alias points to an earlier version (or no version on first deploy).
  const lambdaTimeout = getLambdaTimeout(manifest);
  debug("Lambda timeout %d seconds", lambdaTimeout);
  const versionARN = await uploadLambda({
    envVars,
    accountId: config.accountId,
    lambdaName,
    lambdaTimeout,
    lambdaRuntime,
    region: config.region,
    wsApiId: config.wsApiId,
    zip,
  });

  if (signal?.aborted) throw new Error();

  // From this point on, we hope to complete successfully and so ignore abort signal
  return await switchOver({
    queues: manifest.queues,
    queuePrefix,
    versionARN,
  });
}

async function loadEnvVars({
  environment,
  envVars,
  httpURL,
  wsURL,
}: {
  environment: "production" | "preview";
  envVars?: Record<string, string>;
  httpURL: string;
  wsURL: string;
}) {
  const fromFile = await fs.readFile(`.env.${environment}`, "utf-8").then(
    (file) => dotenv.parse(file),
    () => undefined
  );
  debug(
    'Loaded %d env vars from file "%s"',
    Object.keys(fromFile ?? {}).length,
    ".env"
  );

  return {
    ...fromFile,
    ...envVars,
    NODE_ENV: "production",
    QUEUE_RUN_URL: httpURL,
    QUEUE_RUN_WS: wsURL,
    QUEUE_RUN_ENV: environment,
  };
}

function getLambdaTimeout(manifest: Manifest) {
  return Math.max(
    ...Array.from(manifest.queues.values()).map((queue) => queue.timeout),
    ...Array.from(manifest.routes.values()).map((route) => route.timeout)
  );
}

async function switchOver({
  queues,
  queuePrefix,
  versionARN,
}: {
  queuePrefix: string;
  queues: Manifest["queues"];
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
  console.info("  This is version %s", versionARN.split(":").slice(-1)[0]);

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
    obsolete.map((arn) => {
      debug('Deleting old version "%s"', arn);
      lambda.deleteFunction({ FunctionName: arn });
    })
  );
}

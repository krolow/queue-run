import { CloudWatchLogs } from "@aws-sdk/client-cloudwatch-logs";
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
  httpUrl: string;

  /** The full URL for this backend's WebSocket. Available to the backed as the
   *  environment variable QUEUE_RUN_WS. */
  wsUrl: string;

  /**  WebSocket Gateway API ID. */
  wsApiId: string;
};

const debug = debuglog("queue-run:deploy");

export async function deployLambda({
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

  const { httpUrl, wsUrl } = config;
  if (!/^https:\/\//.test(httpUrl))
    throw new Error('HTTP URL must start with "https://"');
  if (!/^wss:\/\//.test(wsUrl))
    throw new Error('WS URL must start with "https://"');

  const region = config.region;
  const lambdaName = `qr-${slug}`;
  debug('Lamba name: "%s"', lambdaName);
  const queuePrefix = `${lambdaName}__`;
  debug('Queue prefix: "%s"', queuePrefix);

  console.info(chalk.bold.green("🐇 Deploying %s to %s"), slug, httpUrl);

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
  await createTables(region);
  if (signal?.aborted) throw new Error();

  const envVars = await loadEnvVars({
    envVars: config.envVars ?? {},
    environment: config.env,
    httpUrl,
    wsUrl,
    wsApiId: config.wsApiId,
  });

  if (signal?.aborted) throw new Error();

  const cw = new CloudWatchLogs({ region });
  const logGroupName = `/aws/lambda/${lambdaName}`;
  const logStreamName = `deploy/${crypto.randomUUID()}`;

  await cw.createLogGroup({ logGroupName }).catch(() => undefined);
  await cw
    .createLogStream({ logGroupName, logStreamName })
    .catch(() => undefined);

  // Upload new Lambda function and publish a new version.
  // This doesn't make any difference yet: event sources are tied to an alias,
  // and the alias points to an earlier version (or no version on first deploy).
  const lambdaTimeout = getLambdaTimeout(manifest);
  debug("Lambda timeout %d seconds", lambdaTimeout);
  const versionArn = await uploadLambda({
    envVars,
    accountId: config.accountId,
    lambdaName,
    lambdaTimeout,
    lambdaRuntime,
    region,
    wsApiId: config.wsApiId,
    zip,
  });

  if (signal?.aborted) throw new Error();

  const { nextSequenceToken } = await cw.putLogEvents({
    logGroupName,
    logStreamName,
    logEvents: [
      { message: `Uploaded new version ${versionArn}`, timestamp: Date.now() },
    ],
  });

  // From this point on, we hope to complete successfully and so ignore abort signal
  const aliasArn = await switchOver({
    queues: manifest.queues,
    queuePrefix,
    region,
    versionArn,
  });

  await cw.putLogEvents({
    logGroupName,
    logStreamName,
    logEvents: [
      {
        message: `Switched to new version ${versionArn}`,
        timestamp: Date.now(),
      },
    ],
    sequenceToken: nextSequenceToken!,
  });

  return aliasArn;
}

async function loadEnvVars({
  environment,
  envVars,
  httpUrl,
  wsUrl,
  wsApiId,
}: {
  environment: "production" | "preview";
  envVars?: Record<string, string>;
  httpUrl: string;
  wsUrl: string;
  wsApiId: string;
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
    QUEUE_RUN_ENV: environment,
    QUEUE_RUN_URL: httpUrl,
    QUEUE_RUN_WS_API_ID: wsApiId,
    QUEUE_RUN_WS: wsUrl,
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
  region,
  versionArn,
}: {
  queuePrefix: string;
  queues: Manifest["queues"];
  region: string;
  versionArn: string;
}): Promise<string> {
  const aliasArn = versionArn.replace(/(\d+)$/, "current");

  // Create queues that new version expects, and remove triggers for event
  // sources that new version does not understand.
  const queueArns = await createQueues({
    queues,
    region,
    prefix: queuePrefix,
  });

  await removeTriggers({ lambdaArn: aliasArn, sourceArns: queueArns, region });

  // Update alias to point to new version.
  //
  // The alias includes the branch name, so if you parallel deploy in two
  // branches, you would have two aliases pointing to two different published
  // versions:
  //
  //    {projectId}-{branch} => {projectId}:{version}
  await updateAlias({ aliasArn, versionArn, region });

  // Add triggers for queues that new version can handle.  We do that for the
  // alias, so we only need to add new triggers, existing triggers carry over:
  //
  //   trigger {projectId}-{branch}__{queueName} => {projectId}-{branch}
  await addTriggers({ lambdaArn: aliasArn, sourceArns: queueArns, region });
  console.info("  This is version %s", versionArn.split(":").slice(-1)[0]);

  // Delete any queues that are no longer needed.
  await deleteOldQueues({ prefix: queuePrefix, queueArns, region });

  return aliasArn;
}

export async function getRecentVersions({
  region,
  slug,
}: {
  region: string;
  slug: string;
}): Promise<
  Array<{
    arn: string;
    isCurrent: boolean;
    modified: Date;
    size: number;
    version: string;
  }>
> {
  const lambdaName = `qr-${slug}`;
  const lambda = new Lambda({ region });

  const { FunctionVersion: currentVersion } = await lambda.getAlias({
    FunctionName: lambdaName,
    Name: "current",
  });
  const versions = (await getAllVersions(lambdaName))
    .filter(({ version }) => version !== "$LATEST")
    .sort((a, b) => b.version.localeCompare(a.version));

  return versions.map((version) => ({
    ...version,
    isCurrent: version.version === currentVersion,
  }));
}

async function getAllVersions(
  lambdaName: string,
  nextToken?: string
): Promise<
  Array<{
    arn: string;
    modified: Date;
    size: number;
    version: string;
  }>
> {
  const lambda = new Lambda({});
  const { NextMarker, Versions } = await lambda.listVersionsByFunction({
    FunctionName: lambdaName,
    ...(nextToken && { Marker: nextToken }),
  });
  if (!Versions) return [];
  const versions = Versions.map((version) => ({
    arn: version.FunctionArn!,
    modified: new Date(version.LastModified!),
    size: version.CodeSize!,
    version: version.Version!,
  }));
  return NextMarker
    ? [...versions, ...(await getAllVersions(lambdaName, NextMarker))]
    : versions;
}

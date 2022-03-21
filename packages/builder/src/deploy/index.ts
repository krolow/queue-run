import { CloudWatchLogs } from "@aws-sdk/client-cloudwatch-logs";
import { Lambda } from "@aws-sdk/client-lambda";
import chalk from "chalk";
import filesize from "filesize";
import getRepoInfo from "git-repo-info";
import { AbortSignal } from "node-abort-controller";
import { debuglog, format } from "node:util";
import ora from "ora";
import invariant from "tiny-invariant";
import { buildProject, displayManifest } from "../build/index.js";
import { currentVersionAlias } from "../constants.js";
import { getEnvVariables } from "../manage/env_vars.js";
import { deleteAPIGateway, setupAPIGateway } from "./gateway.js";
import { deleteLambdaRole } from "./lambda_role.js";
import { deleteStack, deployStack } from "./stack.js";
import updateAlias from "./update_alias.js";
import uploadLambda from "./upload_lambda.js";
export { getAPIGatewayUrls } from "./gateway.js";

const debug = debuglog("queue-run:deploy");

export async function deployLambda({
  buildDir,
  environment,
  envVars: cliEnvVars,
  project,
  region,
  signal = new AbortSignal(),
  sourceDir,
}: {
  buildDir: string;
  environment: "production" | "preview";
  envVars: Map<string, string>;
  project: string;
  region: string;
  signal?: AbortSignal;
  sourceDir: string;
}): Promise<{
  httpUrl: string;
  websocketUrl: string;
}> {
  // Note: queue names have 80 characters limit, when we combine
  // {qrPrefix}{project}_{branch}__{queueName} we have a total of 27 characters
  // available.
  if (!project && /^[a-zA-Z0-9-]{1,40}$/.test(project))
    throw new Error(
      "Project name must be 40 characters or less, alphanumeric and dashes"
    );

  const lambdaName = `qr-${project}`;
  debug('Lamba name: "%s"', lambdaName);
  const queuePrefix = `${lambdaName}__`;
  debug('Queue prefix: "%s"', queuePrefix);
  const buildId = crypto.randomUUID!().slice(24);

  const { lambdaRuntime, zip, manifest } = await buildProject({
    buildDir,
    full: true,
    signal,
    sourceDir,
  });
  invariant(zip);
  await displayManifest(buildDir);
  if (signal?.aborted) throw new Error("Timeout");

  const logToCloudWatch = await useLogToCloudWatch({
    buildId,
    lambdaName,
    region,
  });
  console.info(chalk.bold("\nDeploying Lambda function\n"));
  logToCloudWatch('Deploying Lambda function "%s"', lambdaName);

  const spinner = ora("Setting up API Gateway...").start();
  const { httpApiId, httpUrl, websocketUrl, websocketApiId } =
    await setupAPIGateway({
      project,
      region,
    });
  spinner.stop();

  const envVars = await loadEnvVars({
    buildId,
    environment,
    envVars: cliEnvVars,
    httpUrl,
    project,
    region,
    websocketUrl,
    websocketApiId,
  });

  if (signal?.aborted) throw new Error();

  const limits = {
    memory: manifest.limits.memory,
    timeout: manifest.limits.timeout,
  };

  // Upload new Lambda function and publish a new version.
  // This doesn't make any difference yet: event sources are tied to an alias,
  // and the alias points to an earlier version (or no version on first deploy).
  const versionArn = await uploadLambda({
    envVars,
    lambdaName,
    lambdaRuntime,
    limits,
    region,
    zip,
  });
  await logToCloudWatch(
    "Uploaded new version: %s (%s)",
    versionArn.split(":").slice(-1).join(""),
    filesize(zip.byteLength)
  );
  if (signal?.aborted) throw new Error();

  const lambdaArn = versionArn.replace(/:(\d+)$/, "");
  const aliasArn = versionArn.replace(/(\d+)$/, currentVersionAlias);
  await updateAlias({ aliasArn, versionArn, region });
  await logToCloudWatch("Switched to new version: %s", versionArn);
  if (signal?.aborted) throw new Error();

  // If aborted in time and stack deploy cancelled, then deployStack will throw.
  const changeSetId = await deployStack({
    buildDir,
    httpApiId,
    lambdaArn,
    signal,
    websocketApiId,
  });
  if (changeSetId)
    await logToCloudWatch("Deployed stack change-set: %s", changeSetId);
  else await logToCloudWatch("No stack changes to deploy");

  return { httpUrl, websocketUrl };
}

async function useLogToCloudWatch({
  buildId,
  lambdaName,
  region,
}: {
  buildId: string;
  lambdaName: string;
  region: string;
}) {
  const cw = new CloudWatchLogs({ region });
  const logGroupName = `/aws/lambda/${lambdaName}`;
  const logStreamName = `deploy/${buildId}`;

  await cw.createLogGroup({ logGroupName }).catch(() => undefined);
  await cw
    .createLogStream({ logGroupName, logStreamName })
    .catch(() => undefined);
  let logToken: string;
  return async function (...args: any[]) {
    const message = `${buildId}: ${format(...args)}`;
    logToken = (
      await cw.putLogEvents({
        logGroupName,
        logStreamName,
        logEvents: [{ message, timestamp: Date.now() }],
        sequenceToken: logToken,
      })
    ).nextSequenceToken!;
  };
}

async function loadEnvVars({
  buildId,
  environment,
  envVars,
  httpUrl,
  project,
  region,
  websocketUrl,
  websocketApiId,
}: {
  buildId: string;
  environment: "production" | "preview";
  envVars: Map<string, string>;
  httpUrl: string;
  project: string;
  region: string;
  websocketUrl: string;
  websocketApiId: string;
}) {
  // Environment from database
  const merged = await getEnvVariables({
    environment,
    project,
    region,
  });

  // Command line environment variables over-ride database
  for (const [key, value] of Array.from(envVars.entries()))
    merged.set(key, value);

  // These always take precedence
  merged.set("BUILD_ID", buildId);
  merged.set("NODE_ENV", "production");
  merged.set("QUEUE_RUN_ENV", environment);
  merged.set("QUEUE_RUN_URL", httpUrl);
  merged.set("QUEUE_RUN_WS", websocketUrl);
  merged.set("QUEUE_RUN_WS_API_ID", websocketApiId);
  const { branch, tag, sha } = getRepoInfo();
  merged.set("GIT_BRANCH", branch);
  merged.set("GIT_SHA", sha);
  if (tag) merged.set("GIT_TAG", tag);

  return merged;
}

export async function deleteLambda({
  project,
  region,
}: {
  project: string;
  region: string;
}) {
  const lambdaName = `qr-${project}`;
  await deleteStack(lambdaName);
  const lambda = new Lambda({ region });

  const spinner = ora(`Deleting Lambda function ${lambdaName}`).start();
  try {
    await lambda.deleteFunction({ FunctionName: lambdaName });
  } catch (error) {
    if ((error as { name: string }).name !== "ResourceNotFoundException")
      throw error;
  }
  await deleteLambdaRole({ lambdaName, region });
  await deleteAPIGateway({ project, region });
  spinner.succeed();
}

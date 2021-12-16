import { IAM } from "@aws-sdk/client-iam";
import { Lambda } from "@aws-sdk/client-lambda";
import { SQS } from "@aws-sdk/client-sqs";
import type { QueueConfig } from "@queue-run/runtime";
import dotenv from "dotenv";
import ms from "ms";
import ow from "ow";
import invariant from "tiny-invariant";
import moduleLoader from "../moduleLoader";
import loadEnvVars from "../util/loadEnvVars";
import createZip from "./createZip";
import { addTriggers, removeTriggers } from "./lambdaTriggers";
import loadQueues from "./loadQueues";
import { createQueues, deleteOldQueues } from "./prepareQueues";
import updateAlias from "./updateAlias";
import uploadLambda from "./uploadLambda";

export default async function upload({
  buildDir,
  branch,
  projectId,
  region,
}: {
  buildDir: string;
  branch: string;
  projectId: string;
  region: string;
}) {
  ow(
    projectId,
    ow.string.nonEmpty
      .matches(/^([a-z0-9]+-){1,}[a-z0-9]+$/)
      .message("Project ID must look like `grumpy-sunshine`")
  );
  ow(
    branch,
    ow.string
      .matches(/^[a-z0-9-]+$/i)
      .message("Branch name can only contain alphanumeric and hypen characters")
  );

  if (!process.env.CREDENTIALS)
    throw new Error("CREDENTIALS environment variable is not set");
  const credentials = dotenv.parse(process.env.CREDENTIALS);
  const clientConfig = {
    credentials: {
      accessKeyId: credentials.aws_access_key_id,
      secretAccessKey: credentials.aws_secret_access_key,
    },
    region: region ?? credentials.aws_region,
  };

  const iam = new IAM(clientConfig);
  const lambda = new Lambda(clientConfig);
  const sqs = new SQS(clientConfig);

  const envVars = {
    ...(await loadEnvVars()),
    NODE_ENV: "production",
    QUEUE_RUN_PROJECT: projectId,
    QUEUE_RUN_BRANCH: branch,
  };

  const lambdaName = `backend-${projectId}`;
  const lambdaAalias = `${lambdaName}-${branch}`;
  const queuePrefix = `${projectId}-${branch}__`;

  // Sanity check on the source code, and we also need this info to configure
  // queues, etc.  Note that full build also compiles TS, but doesn't load the
  // module, so some code issues will only show at this point.
  console.info("λ: Loading source code");

  await moduleLoader({ dirname: buildDir, watch: false });
  const queues = await loadQueues(buildDir);
  if (queues.size === 0) throw new Error("No queues found in source code");

  const lambdaTimeout = getLambdaTimeout(queues);

  const zip = await createZip(buildDir);
  console.info("");

  const start = Date.now();
  // Upload new Lambda function and publish a new version.
  // This doesn't make any difference yet: event sources are tied to an alias,
  // and the alias points to an earlier version (or no version on first deploy).
  const versionARN = await uploadLambda({
    buildDir,
    envVars,
    iam,
    lambda,
    lambdaName,
    lambdaTimeout,
    zip,
  });
  // goose-bump:50 => goose-bump:goose-bump-main
  const version = versionARN.match(/(\d)+$/)?.[1];
  invariant(version);
  const aliasARN = versionARN.replace(/(\d+)$/, lambdaAalias);

  // Create queues that new version expects, and remove triggers for event
  // sources that new version does not understand.
  const queueARNs = await createQueues({
    configs: queues,
    prefix: queuePrefix,
    sqs,
    lambdaTimeout,
  });
  await removeTriggers({ lambda, lambdaARN: aliasARN, sourceARNs: queueARNs });

  // Update alias to point to new version.
  //
  // The alias includes the branch name, so if you parallel deploy in two
  // branches, you would have two aliases pointing to two different published
  // versions:
  //
  //    {projectId}-{branch} => {projectId}:{version}
  await updateAlias({ aliasARN, lambda, versionARN });

  // Add triggers for queues that new version can handle.  We do that for the
  // alias, so we only need to add new triggers, existing triggers carry over:
  //
  //   trigger {projectId}-{branch}__{queueName} => {projectId}-{branch}
  await addTriggers({ lambda, lambdaARN: aliasARN, sourceARNs: queueARNs });
  console.info(
    "λ: Using %s version %s with branch %s",
    lambdaName,
    version,
    branch
  );

  // Delete any queues that are no longer needed.
  await deleteOldQueues({ prefix: queuePrefix, queueARNs, sqs });
  console.info("✨  Done in %s.", ms(Date.now() - start));
  console.info("");
}

function getLambdaTimeout(queues: Map<string, QueueConfig>) {
  const timeout = Math.max(
    ...Array.from(queues.values()).map((config) => config.timeout ?? 10)
  );
  console.log(timeout);
  const maxTimeout = 30;
  ow(
    timeout,
    ow.number
      .greaterThan(0)
      .message("One or more functions has a negative or zero timeout")
  );
  ow(
    timeout,
    ow.number
      .lessThanOrEqual(maxTimeout)
      .message(
        `One or more functions has a timeout more than the maximum of ${maxTimeout} minutes`
      )
  );
  // Actual timeout should give all queues time to complete
  return timeout * 6;
}

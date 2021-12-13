import { QueueConfig } from "@queue-run/runtime";
import ms from "ms";
import ow from "ow";
import invariant from "tiny-invariant";
import { buildDir } from "../constants";
import loadGroup from "../functions/loadGroup";
import createZip from "./createZip";
import { addTriggers, removeTriggers } from "./lambdaTriggers";
import { createQueues, deleteOldQueues } from "./prepareQueues";
import updateAlias from "./updateAlias";
import uploadLambda from "./uploadLambda";

export default async function upload({
  branch,
  envVars: sourceEnvVars,
  projectId,
  region,
}: {
  branch: string;
  envVars: Record<string, string>;
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

  const envVars = {
    ...sourceEnvVars,
    NODE_ENV: "production",
    QUEUE_RUN_PROJECT: projectId,
    QUEUE_RUN_BRANCH: branch,
  };

  const lambdaName = `backend-${projectId}`;
  const alias = `${lambdaName}-${branch}`;
  const prefix = `${alias}__`;

  // Sanity check on the source code, and we also need this info to configure
  // queues, etc.  Note that full build also compiles TS, but doesn't load the
  // module, so some code issues will only show at this point.
  console.info("λ: Loading source code");

  const queues = await loadGroup({
    dirname: buildDir,
    envVars,
    group: "queue",
    watch: false,
  });
  const lambdaTimeout = getLambdaTimeout(queues);

  const zip = await createZip(buildDir);
  console.info("");

  const start = Date.now();
  // Upload new Lambda function and publish a new version.
  // This doesn't make any difference yet: event sources are tied to an alias,
  // and the alias points to an earlier version (or no version on first deploy).
  const versionARN = await uploadLambda({
    envVars,
    lambdaName,
    lambdaTimeout,
    zip,
    region,
  });
  // goose-bump:50 => goose-bump:goose-bump-main
  const version = versionARN.match(/(\d)+$/)?.[1];
  invariant(version);
  const aliasARN = versionARN.replace(/(\d+)$/, alias);

  // Create queues that new version expects, and remove triggers for event
  // sources that new version does not understand.
  const queueARNs = await createQueues({
    configs: queues,
    prefix,
    region,
    lambdaTimeout,
  });
  await removeTriggers({ lambdaARN: aliasARN, sourceARNs: queueARNs, region });

  // Update alias to point to new version.
  //
  // The alias includes the branch name, so if you parallel deploy in two
  // branches, you would have two aliases pointing to two different published
  // versions:
  //
  //    {projectId}-{branch} => {projectId}:{version}
  await updateAlias({ aliasARN, region, versionARN });

  // Add triggers for queues that new version can handle.  We do that for the
  // alias, so we only need to add new triggers, existing triggers carry over:
  //
  //   trigger {projectId}-{branch}__{queueName} => {projectId}-{branch}
  await addTriggers({ lambdaARN: aliasARN, sourceARNs: queueARNs, region });
  console.info(
    "λ: Using %s version %s with branch %s",
    lambdaName,
    version,
    branch
  );

  // Delete any queues that are no longer needed.
  await deleteOldQueues({ prefix, queueARNs, region });
  console.info("✨  Done in %s.", ms(Date.now() - start));
  console.info("");
}

function getLambdaTimeout(queues: Map<string, { config: QueueConfig }>) {
  const lambdaTimeout = Math.max(
    ...Array.from(queues.values()).map(({ config }) => config.timeout ?? 10)
  );
  const maxTimeout = 300; // 5 minutes
  ow(
    lambdaTimeout,
    ow.number
      .greaterThan(0)
      .message("One or more functions has a negative or zeo timeout")
  );
  ow(
    lambdaTimeout,
    ow.number
      .lessThanOrEqual(maxTimeout)
      .message(
        `One or more functions has a timeout more than the maximum of ${
          maxTimeout / 60
        } minutes`
      )
  );
  return lambdaTimeout;
}

import ms from "ms";
import ow from "ow";
import { buildDir } from "./constants";
import createZip from "./createZip";
import fullBuild from "./fullBuild";
import { addTriggers, removeTriggers } from "./lambdaTriggers";
import loadGroup from "./loadGroup";
import { createQueues, deleteOldQueues } from "./prepareQueues";
import updateAlias from "./updateAlias";
import uploadLambda from "./uploadLambda";

const defaultRegion = "us-east-1";

export default async function deploy({
  branch = "main",
  projectId,
  region = process.env.AWS_REGION ?? defaultRegion,
  sourceDir = process.cwd(),
}: {
  branch?: string;
  projectId: string;
  region?: string;
  sourceDir?: string;
}) {
  ow(
    projectId,
    ow.string.nonEmpty
      .matches(/^([a-z0-9]+-){1,}[a-z0-9]+$/)
      .message("Project ID must look like `grumpy-sunshine`")
  );
  ow(
    branch,
    ow.string.nonEmpty
      .matches(/^[a-z0-9-]+$/i)
      .message("Branch name can only contain alphanumeric and hypen characters")
  );

  const lambdaName = projectId;
  const alias = `${lambdaName}-${branch}`;
  const prefix = `${alias}__`;

  // Creating everything we need to zip
  await fullBuild({ buildDir, sourceDir });
  console.info("");

  // Sanity check on the source code, and we also need this info to configure
  // queues, etc.  Note that full build also compiles TS, but doesn't load the
  // module, so some code issues will only show at this point.
  console.info("λ: Loading source code");
  const queues = await loadGroup({ dirname: buildDir, group: "queue" });

  const zip = await createZip(buildDir);
  console.info("");

  const start = Date.now();
  // Upload new Lambda function and publish a new version.
  // This doesn't make any difference yet: event sources are tied to an alias,
  // and the alias points to an earlier version (or no version on first deploy).
  const { functionArn, version } = await uploadLambda({
    lambdaName,
    zip,
    region,
  });
  const aliasArn = `${functionArn}:${alias}`;

  // Create queues that new version expects, and remove triggers for event
  // sources that new version does not understand.
  const queueArns = await createQueues({ configs: queues, prefix, region });
  await removeTriggers({ lambdaName: aliasArn, sourceArns: queueArns, region });

  // Update alias to point to new version.
  //
  // The alias includes the branch name, so if you parallel deploy in two
  // branches, you would have two aliases pointing to two different published
  // versions:
  //
  //    {projectId}-{branch} => {projectId}:{version}
  await updateAlias({ alias, lambdaName, region, version });

  // Add triggers for queues that new version can handle.  We do that for the
  // alias, so we only need to add new triggers, existing triggers carry over:
  //
  //   trigger {projectId}-{branch}__{queueName} => {projectId}-{branch}
  await addTriggers({ lambdaName: aliasArn, sourceArns: queueArns, region });
  console.info("λ: Published version %s", version);

  // Delete any queues that are no longer needed.
  await deleteOldQueues({ prefix, queueArns, region });
  console.info("✨  Done in %s.", ms(Date.now() - start));
  console.info("");
}

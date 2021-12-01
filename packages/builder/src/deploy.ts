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

export default async function deploy({
  branch = "main",
  projectId,
  sourceDir = process.cwd(),
}: {
  branch?: string;
  projectId: string;
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

  await fullBuild({ buildDir, sourceDir: "." });
  console.info("");

  console.info("λ: Loading source code");
  const queues = await loadGroup({ dirname: buildDir, group: "queue" });

  const zip = await createZip(buildDir);
  console.info("");

  const start = Date.now();
  const version = await uploadLambda({ lambdaName, zip });

  const queueArns = await createQueues({ configs: queues, prefix });
  await removeTriggers(lambdaName, queueArns);

  const aliasArn = await updateAlias({ alias, lambdaName, version });

  await addTriggers(aliasArn, queueArns);
  console.info("λ: Published version %s", version);

  await deleteOldQueues(prefix, queueArns);
  console.info("✨  Done in %s.", ms(Date.now() - start));
  console.info("");
}

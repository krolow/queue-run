import ms from "ms";
import ow from "ow";
import { buildDir } from "./constants";
import createZip from "./createZip";
import fullBuild from "./fullBuild";
import { addTriggers, removeTriggers } from "./lambdaTriggers";
import { createQueues, deleteOldQueues } from "./prepareQueues";
import updateAlias from "./updateAlias";
import uploadLambda from "./uploadLambda";

export default async function deploy({
  branch = "main",
  projectId,
}: {
  branch?: string;
  projectId: string;
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

  await fullBuild();
  console.info("");

  const zip = await createZip(buildDir);
  console.info("");

  await uploadAndConfigure({ lambdaName: projectId, branch, zip });
  console.info("");
}

async function uploadAndConfigure({
  branch,
  lambdaName,
  zip,
}: {
  branch: string;
  lambdaName: string;
  zip: Uint8Array;
}) {
  const alias = `${lambdaName}-${branch}`;
  const prefix = `${alias}__`;

  const start = Date.now();
  const version = await uploadLambda({ lambdaName, zip });

  const queueArns = await createQueues({ dirname: buildDir, prefix });
  await removeTriggers(lambdaName, queueArns);

  const aliasArn = await updateAlias({ alias, lambdaName, version });

  await addTriggers(aliasArn, queueArns);
  console.info("λ: Published version %s", version);

  await deleteOldQueues(prefix, queueArns);
  console.info("✨  Done in %s.", ms(Date.now() - start));
}

import ow from "ow";
import { buildDir } from "./constants";
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

  const lambdaName = projectId;
  const alias = `${lambdaName}-${branch}`;

  await fullBuild();
  const version = await uploadLambda({ dirname: buildDir, lambdaName });

  const prefix = `${alias}__`;
  const queueArns = await createQueues({ dirname: buildDir, prefix });
  await removeTriggers(lambdaName, queueArns);

  const aliasArn = await updateAlias({ alias, lambdaName, version });

  await addTriggers(aliasArn, queueArns);
  console.info("λ: Published %s", aliasArn);

  await deleteOldQueues(prefix, queueArns);
}

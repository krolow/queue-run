import { fullBuild } from "../build";
import { buildDir } from "./constants";
import { addTriggers, removeTriggers } from "./lambdaTriggers";
import { createQueues, deleteOldQueues } from "./prepareQueues";
import updateAlias from "./updateAlias";
import uploadLambda from "./uploadLambda";

(async (branch: string) => {
  const lambdaName = "goose-dump";
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
})("prod");

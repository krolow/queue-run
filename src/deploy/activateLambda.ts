import { Lambda } from "@aws-sdk/client-lambda";
import { createQueues, deleteOldQueues } from "./queues";
import { addTriggers, removeTriggers } from "./triggers";
import uploadLambda from "./uploadLambda";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
const lambda = new Lambda({ profile: "untitled" });

export default async function activateLambda({
  alias,
  dirname,
  lambdaName,
}: {
  alias: string;
  dirname: string;
  lambdaName: string;
}) {
  const prefix = `${alias}__`;
  const queueArns = await createQueues({ dirname, prefix });
  await removeTriggers(lambdaName, queueArns);

  const revisionId = await uploadLambda({ dirname, lambdaName });
  const version = await publishNewVersion({ lambdaName, revisionId });
  const aliasArn = await updateAlias({ alias, lambdaName, version });

  await addTriggers(aliasArn, queueArns);
  console.info("λ: Published %s", aliasArn);

  await deleteOldQueues(prefix, queueArns);
}

async function publishNewVersion({
  lambdaName,
  revisionId,
}: {
  lambdaName: string;
  revisionId: string;
}): Promise<string> {
  const { Version: version } = await lambda.publishVersion({
    FunctionName: lambdaName,
    RevisionId: revisionId,
  });
  if (!version) throw new Error("Could not publish function");
  return version;
}

async function updateAlias({
  alias,
  lambdaName,
  version,
}: {
  alias: string;
  lambdaName: string;
  version: string;
}): Promise<string> {
  const { AliasArn: arn } = await lambda.getAlias({
    FunctionName: lambdaName,
    Name: alias,
  });
  if (arn) {
    await lambda.createAlias({
      FunctionName: lambdaName,
      FunctionVersion: version,
      Name: alias,
    });
    return arn;
  } else {
    const { AliasArn: arn } = await lambda.updateAlias({
      FunctionName: lambdaName,
      FunctionVersion: version,
      Name: alias,
    });
    if (!arn) throw new Error("Could not create alias");
    return arn;
  }
}

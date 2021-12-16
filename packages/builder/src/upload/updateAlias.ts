import type { Lambda } from "@aws-sdk/client-lambda";
import invariant from "tiny-invariant";

export default async function updateAlias({
  aliasARN,
  lambda,
  versionARN,
}: {
  aliasARN: string;
  lambda: Lambda;
  versionARN: string;
}): Promise<string> {
  const [lambdaName, alias] = aliasARN.match(/([^:]+):([^:]+)$/)!.slice(1);
  const version = versionARN.match(/\d+$/)?.[0];
  invariant(alias && lambdaName);

  try {
    const { AliasArn: arn } = await lambda.getAlias({
      FunctionName: lambdaName,
      Name: alias,
    });
    if (arn) {
      invariant(version);
      const { AliasArn: arn } = await lambda.updateAlias({
        FunctionName: lambdaName,
        FunctionVersion: version,
        Name: alias,
      });
      if (!arn) throw new Error("Could not update alias");
      return arn;
    }
  } catch (error) {
    if (!(error instanceof Error && error.name === "ResourceNotFoundException"))
      throw error;
  }

  const { AliasArn: arn } = await lambda.createAlias({
    FunctionName: lambdaName,
    FunctionVersion: version,
    Name: alias,
  });
  if (!arn) throw new Error("Could not create alias");

  return arn;
}

import { lambda } from "./clients";

export default async function updateAlias({
  alias,
  lambdaName,
  version,
}: {
  alias: string;
  lambdaName: string;
  version: string;
}): Promise<string> {
  try {
    const { AliasArn: arn } = await lambda.getAlias({
      FunctionName: lambdaName,
      Name: alias,
    });
    if (arn) {
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

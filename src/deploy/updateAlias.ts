import { Lambda } from "@aws-sdk/client-lambda";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
const lambda = new Lambda({ profile: "untitled" });

export default async function updateAlias({
  alias,
  lambdaName,
  version,
}: {
  alias: string;
  lambdaName: string;
  version: string;
}): Promise<string> {
  console.info("λ: Updating alias for %s version %s …", lambdaName, version);

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

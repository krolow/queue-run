import { FunctionConfiguration, Lambda } from "@aws-sdk/client-lambda";
import ora from "ora";
import invariant from "tiny-invariant";
import { deleteLambdaRole, getLambdaRole } from "./lambdaRole.js";

export const handler = "runtime.handler";

// Creates or updates Lambda function with latest configuration and code.
// Publishes the new version and returns the published version ARN.
export default async function uploadLambda({
  accountId,
  envVars,
  lambdaName,
  lambdaRuntime,
  lambdaTimeout,
  region,
  wsApiId,
  zip,
}: {
  accountId: string;
  envVars: Record<string, string>;
  lambdaName: string;
  lambdaTimeout: number;
  lambdaRuntime: string;
  region: string;
  wsApiId: string;
  zip: Uint8Array;
}): Promise<string> {
  const lambda = new Lambda({ region });
  const spinner = ora(`Uploading Lambda "${lambdaName}"`).start();

  const roleArn = await getLambdaRole({
    accountId,
    lambdaName,
    region,
    wsApiId,
  });

  const configuration = {
    Environment: { Variables: aliasAWSEnvVars(envVars) },
    FunctionName: lambdaName,
    Handler: handler,
    MemorySize: 1024,
    Role: roleArn,
    Runtime: lambdaRuntime,
    Timeout: lambdaTimeout,
    TracingConfig: { Mode: "Active" },
  };

  const existing = await getFunction({ lambda, lambdaName });
  if (existing) {
    invariant(existing.RevisionId);
    // Change configuration first, here we determine runtime, and only then
    // load code and publish.
    const updatedConfig = await lambda.updateFunctionConfiguration({
      ...configuration,
      RevisionId: existing.RevisionId,
    });
    invariant(updatedConfig.RevisionId);

    const updatedConfigRevisionId = await waitForNewRevision({
      lambda,
      lambdaName,
      revisionId: updatedConfig.RevisionId,
    });
    invariant(updatedConfigRevisionId);

    const updatedCode = await lambda.updateFunctionCode({
      FunctionName: lambdaName,
      Publish: true,
      ZipFile: zip,
      RevisionId: updatedConfigRevisionId,
    });
    // FunctionArn includes version number
    invariant(updatedCode.FunctionArn && updatedCode.RevisionId);

    spinner.succeed();

    return updatedCode.FunctionArn;
  } else {
    const newLambda = await lambda.createFunction({
      ...configuration,
      Code: { ZipFile: zip },
      PackageType: "Zip",
      Publish: true,
    });

    spinner.succeed();

    // FunctionArn does not include version number
    return `${newLambda.FunctionArn}:${newLambda.Version}`;
  }
}

async function getFunction({
  lambda,
  lambdaName,
}: {
  lambda: Lambda;
  lambdaName: string;
}): Promise<FunctionConfiguration | null> {
  try {
    const { Configuration: existing } = await lambda.getFunction({
      FunctionName: lambdaName,
    });
    return existing ?? null;
  } catch (error) {
    if (error instanceof Error && error.name === "ResourceNotFoundException")
      return null;
    else throw error;
  }
}

async function waitForNewRevision({
  lambda,
  lambdaName,
  revisionId,
}: {
  lambda: Lambda;
  lambdaName: string;
  revisionId: string;
}): Promise<string> {
  const { Configuration } = await lambda.getFunction({
    FunctionName: lambdaName,
  });
  if (!Configuration?.RevisionId)
    throw new Error("Could not get function configuration");

  if (Configuration.RevisionId === revisionId) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    return await waitForNewRevision({ lambda, lambdaName, revisionId });
  } else {
    return Configuration.RevisionId;
  }
}

function aliasAWSEnvVars(
  envVars: Record<string, string>
): Record<string, string> {
  const aliasPrefix = "ALIASED_FOR_CLIENT__";
  const aliased: Record<string, string> = {};
  for (const [key, value] of Object.entries(envVars)) {
    if (key.startsWith("AWS_")) aliased[`${aliasPrefix}${key}`] = value;
    else aliased[key] = value;
  }
  return aliased;
}

export async function deleteLambda({
  lambdaName,
  region,
}: {
  lambdaName: string;
  region: string;
}) {
  const lambda = new Lambda({ region });
  await lambda.deleteFunction({ FunctionName: lambdaName });
  await deleteLambdaRole({ lambdaName, region });
}

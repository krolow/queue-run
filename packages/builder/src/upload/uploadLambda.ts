import { IAM } from "@aws-sdk/client-iam";
import type { FunctionConfiguration, Lambda } from "@aws-sdk/client-lambda";
import invariant from "tiny-invariant";
import { handler } from "../constants";
import getRuntimeVersion from "../util/getRuntime";
import getLambdaRole, { deleteLambdaRole } from "./lambdaRole";

// Creates or updates Lambda function with latest configuration and code.
// Publishes the new version and returns the published version ARN.
export default async function uploadLambda({
  buildDir,
  envVars,
  iam,
  lambdaName,
  lambdaTimeout,
  lambda,
  zip,
}: {
  buildDir: string;
  envVars: Record<string, string>;
  iam: IAM;
  lambdaName: string;
  lambdaTimeout: number;
  lambda: Lambda;
  zip: Uint8Array;
}): Promise<string> {
  const configuration = {
    Environment: { Variables: aliasAWSEnvVars(envVars) },
    FunctionName: lambdaName,
    Handler: handler,
    Role: await getLambdaRole({ lambdaName, iam }),
    Runtime: (await getRuntimeVersion(buildDir)).lambdaRuntime,
    Timeout: lambdaTimeout,
    TracingConfig: { Mode: "Active" },
  };

  const existing = await getFunction({ lambda, lambdaName });
  if (existing) {
    // Change configuration first, here we determine runtime, and only then
    // load code and publish.
    const updatedConfig = await lambda.updateFunctionConfiguration({
      ...configuration,
      RevisionId: existing.RevisionId,
    });
    invariant(updatedConfig.RevisionId);

    const { RevisionId: updatedConfigRevisionId } = await waitForNewRevision({
      lambda,
      lambdaName,
      revisionId: updatedConfig.RevisionId,
    });

    const updatedCode = await lambda.updateFunctionCode({
      FunctionName: lambdaName,
      Publish: true,
      ZipFile: zip,
      RevisionId: updatedConfigRevisionId,
    });
    // FunctionArn includes version number
    invariant(updatedCode.FunctionArn && updatedCode.RevisionId);

    console.info("λ: Updated function %s", lambdaName);
    return updatedCode.FunctionArn;
  }

  const newLambda = await lambda.createFunction({
    ...configuration,
    Code: { ZipFile: zip },
    PackageType: "Zip",
    Publish: true,
  });
  // FunctionArn does not include version number
  const arn = `${newLambda.FunctionArn}:${newLambda.Version}`;
  console.info(
    "λ: Created new function %s in %s",
    lambdaName,
    await lambda.config.region()
  );

  return arn;
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
}): Promise<FunctionConfiguration> {
  const { Configuration } = await lambda.getFunction({
    FunctionName: lambdaName,
  });
  if (!Configuration?.RevisionId)
    throw new Error("Could not get function configuration");

  if (Configuration.RevisionId === revisionId) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    return await waitForNewRevision({ lambda, lambdaName, revisionId });
  } else {
    return Configuration;
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
  iam,
  lambda,
  lambdaName,
}: {
  iam: IAM;
  lambda: Lambda;
  lambdaName: string;
}) {
  await lambda.deleteFunction({ FunctionName: lambdaName });
  await deleteLambdaRole({ lambdaName, iam });
}

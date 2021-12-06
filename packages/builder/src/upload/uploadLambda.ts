import { Lambda } from "@aws-sdk/client-lambda";
import { handler } from "../constants";
import getRuntimeVersion from "../util/getRuntime";
import { buildDir } from "./../constants";
import createLambdaRole from "./createLambdaRole";

export default async function uploadLambda({
  envVars,
  lambdaName,
  region,
  zip,
}: {
  envVars: Record<string, string>;
  lambdaName: string;
  region: string;
  zip: Uint8Array;
}): Promise<{ functionArn: string; version: string }> {
  const lambda = new Lambda({ region });

  const { functionArn, revisionId } = await createOrUpdateLambda({
    envVars,
    lambda,
    lambdaName,
    region,
    zip,
  });
  const version = await publishNewVersion({ lambda, lambdaName, revisionId });
  return { functionArn, version };
}

async function createOrUpdateLambda({
  envVars,
  lambda,
  lambdaName,
  region,
  zip,
}: {
  envVars: Record<string, string>;
  lambda: Lambda;
  lambdaName: string;
  region: string;
  zip: Uint8Array;
}): Promise<{
  functionArn: string;
  revisionId: string;
}> {
  const { lambdaRuntime } = await getRuntimeVersion(buildDir);

  try {
    const { Configuration: existing } = await lambda.getFunction({
      FunctionName: lambdaName,
    });

    if (existing) {
      // Change configuration first, here we determine runtime, and only then
      // load code and publish.
      const newConfig = await lambda.updateFunctionConfiguration({
        Environment: { Variables: aliasAWSEnvVars(envVars) },
        FunctionName: lambdaName,
        Handler: handler,
        RevisionId: existing.RevisionId,
        Runtime: lambdaRuntime,
      });
      if (!newConfig.RevisionId)
        throw new Error("Could not update function with new configuration");
      const newConfigRevisionId = await waitForNewRevision({
        lambda,
        lambdaName,
        revisionId: newConfig.RevisionId,
      });

      const newCode = await lambda.updateFunctionCode({
        FunctionName: lambdaName,
        Publish: false,
        ZipFile: zip,
        RevisionId: newConfigRevisionId,
      });
      if (!newCode.RevisionId)
        throw new Error("Could not update function with new code");
      const newCodeRevisionId = await waitForNewRevision({
        lambda,
        lambdaName,
        revisionId: newCode.RevisionId,
      });

      console.info("λ: Updated function %s", lambdaName);
      return {
        functionArn: newConfig.FunctionArn!,
        revisionId: newCodeRevisionId,
      };
    }
  } catch (error) {
    if (!(error instanceof Error && error.name === "ResourceNotFoundException"))
      throw error;
  }

  const role = await createLambdaRole({
    lambdaName,
    region: lambda.config.region as string,
  });
  const newLambda = await lambda.createFunction({
    Code: { ZipFile: zip },
    Environment: { Variables: aliasAWSEnvVars(envVars) },
    FunctionName: lambdaName,
    Handler: handler,
    PackageType: "Zip",
    Publish: false,
    Role: role.Arn,
    Runtime: lambdaRuntime,
    TracingConfig: { Mode: "Active" },
    Timeout: 300,
  });
  if (!newLambda.RevisionId) throw new Error("Could not create function");

  const finalRevisionId = await waitForNewRevision({
    lambda,
    lambdaName,
    revisionId: newLambda.RevisionId,
  });
  console.info("λ: Created new function %s in %s", lambdaName, region);
  return { functionArn: newLambda.FunctionArn!, revisionId: finalRevisionId };
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

async function publishNewVersion({
  lambda,
  lambdaName,
  revisionId,
}: {
  lambda: Lambda;
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

function aliasAWSEnvVars(
  envVars: Record<string, string>
): Record<string, string> {
  const aliased: Record<string, string> = {};
  for (const [key, value] of Object.entries(envVars)) {
    if (key.startsWith("AWS_")) {
      aliased[`__${key}`] = value;
    } else {
      aliased[key] = value;
    }
  }
  return aliased;
}

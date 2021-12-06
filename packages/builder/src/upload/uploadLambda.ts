import { FunctionConfiguration, Lambda } from "@aws-sdk/client-lambda";
import invariant from "tiny-invariant";
import { handler } from "../constants";
import getRuntimeVersion from "../util/getRuntime";
import { buildDir } from "./../constants";
import getLambdaRole from "./lambdaRole";

export default async function uploadLambda({
  envVars,
  lambdaName,
  lambdaTimeout,
  region,
  zip,
}: {
  envVars: Record<string, string>;
  lambdaName: string;
  lambdaTimeout: number;
  region: string;
  zip: Uint8Array;
}): Promise<{ functionArn: string; version: string }> {
  const lambda = new Lambda({ region });

  const configuration = {
    Environment: { Variables: aliasAWSEnvVars(envVars) },
    FunctionName: lambdaName,
    Handler: handler,
    Role: await getLambdaRole({ lambdaName, region }),
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

    const newConfigRevisionId = await waitForNewRevision({
      lambda,
      lambdaName,
      revisionId: updatedConfig.RevisionId,
    });

    const updatedCode = await lambda.updateFunctionCode({
      FunctionName: lambdaName,
      Publish: true,
      ZipFile: zip,
      RevisionId: newConfigRevisionId,
    });
    invariant(
      updatedCode.Version && updatedCode.FunctionArn,
      "Could not update function with new code"
    );

    console.info("λ: Updated function %s", lambdaName);
    return {
      functionArn: updatedCode.FunctionArn,
      version: updatedCode.Version,
    };
  }

  const newLambda = await lambda.createFunction({
    ...configuration,
    Code: { ZipFile: zip },
    PackageType: "Zip",
    Publish: true,
  });
  invariant(
    newLambda.Version && newLambda.FunctionArn,
    "Could not update function with new code"
  );
  console.info("λ: Created new function %s in %s", lambdaName, region);
  return { functionArn: newLambda.FunctionArn, version: newLambda.Version };
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

import { FunctionConfiguration, Lambda } from "@aws-sdk/client-lambda";
import filesize from "filesize";
import ora from "ora";
import invariant from "tiny-invariant";
import { createLambdaRole } from "./lambda_role.js";

const handler = "runtime.handler";

const maxTimeout = 900;

export type Limits = {
  /** Memory size in MBs. Default: 128. */
  memory: number;

  /** Lambda timeout in seconds. This should be the maximum of all task.  */
  timeout: number;
};

// Creates or updates Lambda function with latest configuration and code.
// Publishes the new version and returns the published version ARN.
export default async function uploadLambda({
  envVars,
  lambdaName,
  lambdaRuntime,
  limits,
  region,
  zip,
}: {
  envVars: Map<string, string>;
  lambdaName: string;
  lambdaRuntime: string;
  limits: Limits;
  region: string;
  zip: Uint8Array;
}): Promise<string> {
  const lambda = new Lambda({ region });

  const roleArn = await createLambdaRole({ lambdaName, region });
  const spinner = ora(`Uploading Lambda "${lambdaName}"`).start();

  const configuration = {
    Environment: { Variables: aliasAWSEnvVars(envVars) },
    FunctionName: lambdaName,
    Handler: handler,
    MemorySize: limits.memory ?? 128,
    Role: roleArn,
    Runtime: lambdaRuntime,
    // Allow up to 10 seconds for loading code/warmup
    Timeout: Math.min(limits.timeout + 10, maxTimeout),
    TracingConfig: { Mode: "Active" },
  };

  let arn;

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
    invariant(updatedCode.RevisionId);
    await waitForNewRevision({
      lambda,
      lambdaName,
      revisionId: updatedCode.RevisionId,
    });

    // FunctionArn includes version number
    arn = updatedCode.FunctionArn;
    invariant(arn);
  } else {
    const newLambda = await retry(() =>
      lambda.createFunction({
        ...configuration,
        Code: { ZipFile: zip },
        PackageType: "Zip",
        Publish: true,
      })
    );
    // FunctionArn does not include version number
    arn = `${newLambda.FunctionArn}:${newLambda.Version}`;
  }

  spinner.succeed();

  ora(`Version ${arn.split(":").pop()}`).succeed();
  ora(
    `Available memory: ${filesize(configuration.MemorySize * 1000 * 1000)}`
  ).succeed();
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

async function retry<T>(cb: () => Promise<T>): Promise<T> {
  try {
    return await cb();
  } catch (error) {
    // Race condition with IAM, we get this error:
    // "The role defined for the function cannot be assumed by Lambda."
    if ((error as { name: string }).name === "InvalidParameterValueException") {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      return retry(cb);
    } else throw error;
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

function aliasAWSEnvVars(envVars: Map<string, string>): Record<string, string> {
  const aliasPrefix = "ALIASED_FOR_CLIENT__";
  const aliased: Record<string, string> = {};
  for (const [key, value] of Array.from(envVars.entries())) {
    if (key.startsWith("AWS_")) aliased[`${aliasPrefix}${key}`] = value;
    else aliased[key] = value;
  }
  return aliased;
}

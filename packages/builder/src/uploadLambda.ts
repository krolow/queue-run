import { lambda } from "./clients";
import { handler } from "./constants";
import createLambdaRole from "./createLambdaRole";

export default async function uploadLambda({
  lambdaName,
  zip,
}: {
  lambdaName: string;
  zip: Uint8Array;
}): Promise<string> {
  const revisionId = await createOrUpdateLambda(lambdaName, zip);
  return await publishNewVersion({ lambdaName, revisionId });
}

async function createOrUpdateLambda(
  lambdaName: string,
  zipFile: Uint8Array
): Promise<string> {
  const env = {
    NODE_ENV: "production",
  };

  try {
    const { Configuration: existing } = await lambda.getFunction({
      FunctionName: lambdaName,
    });

    if (existing) {
      console.info("λ: Updating %s …", lambdaName);
      const newCode = await lambda.updateFunctionCode({
        FunctionName: lambdaName,
        Publish: false,
        ZipFile: zipFile,
        RevisionId: existing.RevisionId,
      });
      if (!newCode.RevisionId)
        throw new Error("Could not update function with new code");

      const newCodeRevisionId = await waitForNewRevision(
        lambdaName,
        newCode.RevisionId
      );

      const updated = await lambda.updateFunctionConfiguration({
        Environment: { Variables: env },
        FunctionName: lambdaName,
        Handler: handler,
        RevisionId: newCodeRevisionId,
      });
      if (!updated.RevisionId)
        throw new Error("Could not update function with new configuration");
      const finalRevisionId = await waitForNewRevision(
        lambdaName,
        updated.RevisionId
      );

      console.info("λ: Updated %s", lambdaName);
      return finalRevisionId;
    }
  } catch (error) {
    if (!(error instanceof Error && error.name === "ResourceNotFoundException"))
      throw error;
  }

  const role = await createLambdaRole(lambdaName);
  console.info("λ: Creating new function %s …", lambdaName);
  const newLambda = await lambda.createFunction({
    Code: { ZipFile: zipFile },
    Environment: { Variables: env },
    FunctionName: lambdaName,
    Handler: handler,
    PackageType: "Zip",
    Publish: false,
    Role: role.Arn,
    Runtime: "nodejs14.x",
    TracingConfig: { Mode: "Active" },
  });
  if (!newLambda.RevisionId) throw new Error("Could not create function");

  const finalRevisionId = await waitForNewRevision(
    lambdaName,
    newLambda.RevisionId
  );
  console.info("λ: Created %s", lambdaName);
  return finalRevisionId;
}

async function waitForNewRevision(
  lambdaName: string,
  revisionId: string
): Promise<string> {
  const { Configuration } = await lambda.getFunction({
    FunctionName: lambdaName,
  });
  if (!Configuration?.RevisionId)
    throw new Error("Could not get function configuration");

  if (Configuration.RevisionId === revisionId) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    return await waitForNewRevision(lambdaName, revisionId);
  } else {
    return Configuration.RevisionId;
  }
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

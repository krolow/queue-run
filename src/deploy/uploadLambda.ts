import { Lambda } from "@aws-sdk/client-lambda";
import { createHash } from "crypto";
import createLambdaRole from "./createLambdaRole";
import createZip from "./createZip";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
const lambda = new Lambda({ profile: "untitled" });

const handler = "background/queue/test.handler";

export default async function uploadLambda({
  lambdaName,
  dirname,
}: {
  lambdaName: string;
  dirname: string;
}): Promise<string> {
  const zip = await createZip(dirname);
  return await createUpdateLambda(lambdaName, zip);
}

async function createUpdateLambda(
  lambdaName: string,
  zipFile: Uint8Array
): Promise<string> {
  try {
    const { Configuration: existing } = await lambda.getFunction({
      FunctionName: lambdaName,
    });

    if (existing) {
      const newCode = await lambda.updateFunctionCode({
        FunctionName: lambdaName,
        Publish: false,
        ZipFile: zipFile,
        RevisionId: existing.RevisionId,
      });
      const updated = await lambda.updateFunctionConfiguration({
        FunctionName: lambdaName,
        Handler: handler,
        RevisionId: newCode.RevisionId,
      });
      if (!updated.RevisionId) throw new Error("Could not update function");
      console.info("λ: Updated %s", updated.FunctionArn);
      return await waitForNewRevision(lambdaName, updated.RevisionId, zipFile);
    }
  } catch (error) {
    if (!(error instanceof Error && error.name === "ResourceNotFoundException"))
      throw error;
  }

  const role = await createLambdaRole();
  const newLambda = await lambda.createFunction({
    Code: { ZipFile: zipFile },
    FunctionName: lambdaName,
    Handler: handler,
    PackageType: "Zip",
    Publish: false,
    Role: role.Arn,
    Runtime: "nodejs14.x",
    TracingConfig: { Mode: "Active" },
  });
  if (!newLambda.RevisionId) throw new Error("Could not create function");

  console.info("λ: Created %s", newLambda.FunctionArn);
  return await waitForNewRevision(lambdaName, newLambda.RevisionId, zipFile);
}

async function waitForNewRevision(
  lambdaName: string,
  revisionId: string,
  zipFile: Uint8Array
): Promise<string> {
  const { Configuration } = await lambda.getFunction({
    FunctionName: lambdaName,
  });
  if (!Configuration?.RevisionId)
    throw new Error("Could not get function configuration");

  if (Configuration.RevisionId === revisionId) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    return await waitForNewRevision(lambdaName, revisionId, zipFile);
  } else {
    const sha256 = createHash("sha256").update(zipFile).digest("base64");
    if (sha256 !== Configuration.CodeSha256)
      throw new Error("⚠️ Parallel deploy, aborting");
    return Configuration.RevisionId;
  }
}

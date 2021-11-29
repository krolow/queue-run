import { Lambda } from "@aws-sdk/client-lambda";
import { createHash } from "crypto";
import filesize from "filesize";
import { lstatSync } from "fs";
import { readFile } from "fs/promises";
import glob from "glob";
import JSZip from "jszip";
import path from "path";
import createLambdaRole from "./createLambdaRole";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
const lambda = new Lambda({ profile: "untitled" });

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

async function createZip(dirname: string): Promise<Uint8Array> {
  const zip = new JSZip();
  const filenames = glob.sync(`${dirname}/**/*`);
  for (const filename of filenames) {
    if (lstatSync(filename).isDirectory()) continue;
    const buffer = readFile(filename);
    zip.file(path.relative(dirname, filename), buffer, {
      compression: "DEFLATE",
    });
  }

  const buffer = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  });
  console.info("λ: Zipped %s", filesize(buffer.byteLength));

  const folders = new Map<string, number>();
  for (const file of Object.values(zip.files)) {
    const dirname = path.dirname(file.name);
    const folder = dirname.startsWith("node_modules/")
      ? "/node_modules"
      : path.resolve("/", dirname);
    const { byteLength } = await file.async("uint8array");
    folders.set(folder, (folders.get(folder) ?? 0) + byteLength);
  }
  for (const [dirname, size] of folders) {
    if (size > 0)
      console.info("   %s   %s", truncated(dirname), filesize(size));
  }
  return buffer;
}

function truncated(dirname: string) {
  if (dirname.length < 20) return dirname.padEnd(20);
  if (dirname.length > 20) return dirname.replace(/^(.{9}).*(.{10})$/, "$1…$2");
  return dirname;
}

async function createUpdateLambda(
  lambdaName: string,
  zipFile: Uint8Array
): Promise<string> {
  try {
    const { Configuration } = await lambda.getFunction({
      FunctionName: lambdaName,
    });
    if (Configuration) {
      const updated = await lambda.updateFunctionCode({
        FunctionName: lambdaName,
        Publish: false,
        ZipFile: zipFile,
        RevisionId: Configuration.RevisionId,
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
  const created = await lambda.createFunction({
    Code: { ZipFile: zipFile },
    FunctionName: lambdaName,
    Handler: "index.handler",
    PackageType: "Zip",
    Publish: false,
    Role: role.Arn,
    Runtime: "nodejs14.x",
    TracingConfig: { Mode: "Active" },
  });
  if (!created.RevisionId) throw new Error("Could not create function");

  console.info("λ: Created %s", created.FunctionArn);
  return await waitForNewRevision(lambdaName, created.RevisionId, zipFile);
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

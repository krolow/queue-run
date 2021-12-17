import { DynamoDB } from "@aws-sdk/client-dynamodb";
import { S3 } from "@aws-sdk/client-s3";
import fs from "fs/promises";
import { IncomingMessage } from "http";
import JSZip from "jszip";
import path from "path";
import invariant from "tiny-invariant";

const dynamoDB = new DynamoDB({});
const s3 = new S3({});

const s3Bucket = "queuerun-deploy-upload";

export default async function ({ deployId }: { deployId: string }) {
  console.info("Starting deploy %s", deployId);

  const deploy = await getDeployStatus(deployId);
  if (!deploy) {
    console.info("Deploy not found, bailing");
    return;
  }
  const { projectId, status } = deploy;
  if (status === "completed") {
    console.info("Deploy already completed, scheduling next deploy");
    return nextDeploy(projectId);
  }
  if (status === "running") {
    console.info("Deploy already started, waiting for completion");
    return;
  }

  // TODO handle deploy that timed out

  if ((await countActiveDeploys(projectId)) > 0) {
    console.info("Deploy %s skipped, another deploy is in progress", deployId);
    return;
  }

  await setDeployStarted(deployId);
  const tmpDir = await fs.mkdtemp("/tmp/");
  console.log("Temporary directory", tmpDir);
  try {
    const { Body: zip } = await s3.getObject(objectKey(deployId));
    const sourceDir = path.join(tmpDir, "source");
    await explodeZip(sourceDir, zip as IncomingMessage);

    // TODO run deployment
    // Listen to signal and abort early
    // await setDeployStatus(deployId, "success");
  } catch (error) {
    console.error("Deploy failed", error);
    // await setDeployStatus(deployId, "failed");
  } finally {
    // await s3.deleteObject(objectKey(deployId));
    // fs.rm(tmpDir, { recursive: true, force: true });
  }
  return await nextDeploy(projectId);
}

async function getDeployStatus(deployId: string): Promise<{
  projectId: string;
  status: "waiting" | "running" | "completed";
} | null> {
  const { Items: deploys } = await dynamoDB.executeStatement({
    Statement: "SELECT * FROM deploys WHERE id = ?",
    Parameters: [{ S: deployId }],
  });
  const deploy = deploys[0];
  if (!deploy) return null;

  const projectId = deploy.project_id.S;
  invariant(projectId);
  if (deploy.completed_at) return { projectId, status: "completed" };
  else if (deploy.started) return { projectId, status: "running" };
  else return { projectId, status: "waiting" };
}

async function countActiveDeploys(projectId: string) {
  const { Items: active } = await dynamoDB.executeStatement({
    Statement:
      "SELECT * FROM deploys WHERE project_id = ? AND started_at IS NOT NULL AND completed_at IS NULL",
    Parameters: [{ S: projectId }],
  });
  return active.length;
}

async function setDeployStarted(deployId: string) {
  await dynamoDB.executeStatement({
    Statement: "UPDATE deploys SET started_at = ? WHERE id = ?",
    Parameters: [{ N: Date.now().toString() }, { S: deployId }],
  });
}

async function setDeployStatus(deployId: string, status: "failed" | "success") {
  await dynamoDB.executeStatement({
    Statement: "UPDATE deploys SET completed_at = ?, status = ? WHERE id = ?",
    Parameters: [{ N: Date.now().toString() }, { S: status }, { S: deployId }],
  });
}

async function nextDeploy(projectId: string) {
  const { Items: waiting } = await dynamoDB.executeStatement({
    Statement:
      "SELECT * FROM deploys WHERE project_id = ? AND started_at IS NULL",
    Parameters: [{ S: projectId }],
  });
  const nextDeployId = waiting[0]?.id.S;
  if (nextDeployId) {
    // TODO queue with { deployId }
  }
}

function objectKey(deployId: string) {
  return {
    Bucket: s3Bucket,
    Key: deployId
      .match(/^(.{4})(.*)$/)
      .slice(1)
      .join("/"),
  };
}

async function explodeZip(dirname: string, stream: IncomingMessage) {
  await fs.mkdir(dirname);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  const zip = await JSZip.loadAsync(Buffer.concat(chunks));
  await Promise.all(
    Object.entries(zip.files).map(async ([filename, file]) => {
      const dest = path.join(dirname, filename);
      if (file.dir) await fs.mkdir(dest, { recursive: true });
      else await fs.writeFile(dest, await file.async("nodebuffer"));
    })
  );
}

import { S3 } from "@aws-sdk/client-s3";
import { Readable } from "stream";

const s3 = new S3({});

const s3Bucket = "queuerun-deploy-upload";

export async function deleteS3Archive(deployId: string) {
  await s3.deleteObject(objectKey(deployId));
}

export async function readS3Archive(deployId: string): Promise<Buffer> {
  const { Body } = await s3.getObject(objectKey(deployId));
  const stream = Body as Readable;
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
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

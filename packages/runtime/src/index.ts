import type { CredentialProvider } from "@aws-sdk/types";
import { Request, Response } from "node-fetch";
import type { LambdaEvent } from "../types/lambda";
import { asFetchRequest } from "./asFetch";
import handleSQSMessages from "./sqs";

const projectId = process.env.QUEUE_RUN_PROJECT_ID!;
const branch = process.env.QUEUE_RUN_BRANCH!;

const clientConfig = swapAWSEnvVars();

function swapAWSEnvVars(): {
  credentials: CredentialProvider;
  region: string;
} {
  const credentials = {
    sessionToken: process.env.AWS_SESSION_TOKEN!,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  };
  const region = process.env.AWS_REGION!;

  // Delete these env variables so they're not visible to the client
  delete process.env.AWS_SESSION_TOKEN;
  delete process.env.AWS_ACCESS_KEY_ID;
  delete process.env.AWS_SECRET_ACCESS_KEY;

  // Allow client to bring their own AWS environment variables
  // These were aliased when the Lambda function was created
  const aliasPrefix = "ALIASED_FOR_CLIENT__";
  for (const key of Object.keys(process.env)) {
    if (key.startsWith(aliasPrefix)) {
      process.env[key.substring(aliasPrefix.length)] = process.env[key];
      delete process.env[key];
    }
  }

  return { credentials: async () => credentials, region };
}

export async function handler(event: LambdaEvent) {
  if ("Records" in event) {
    await handleSQSMessages({
      clientConfig,
      messages: event.Records.filter(
        (record) => record.eventSource === "aws:sqs"
      ),
    });
  } else if ("url" in event) {
    return await asFetchRequest(http)(event);
  }
}

async function http(request: Request): Promise<Response> {
  return new Response("OK", { status: 200 });
}

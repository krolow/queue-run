import { SQS } from "@aws-sdk/client-sqs";
import { Response } from "node-fetch";
import { URL } from "node:url";
import type { LambdaEvent } from "../types/lambda";
import { asFetchRequest } from "./asFetch";
import swapAWSEnvVars from "./environment";
import handleSQSMessages from "./handleSQSMessages";
import pushMessage from "./pushMessage";

const { branch, projectId, ...clientConfig } = swapAWSEnvVars();

const sqs = new SQS(clientConfig);

export async function handler(event: LambdaEvent) {
  if ("Records" in event) {
    const messages = event.Records.filter(
      (record) => record.eventSource === "aws:sqs"
    );
    if (messages.length > 0) await handleSQSMessages({ messages, sqs });
  } else if ("url" in event) {
    return await asFetchRequest(event, async (request) => {
      const { pathname } = new URL(request.url);
      if (pathname.startsWith("/queue/"))
        return await pushMessage({ branch, projectId, request, sqs });
      else if (pathname.startsWith("/api/"))
        return new Response("OK", { status: 200 });
      else return new Response("Not Found", { status: 404 });
    });
  }
}

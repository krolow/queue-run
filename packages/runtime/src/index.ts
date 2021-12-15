import { SQS } from "@aws-sdk/client-sqs";
import { Response } from "node-fetch";
import { URL } from "node:url";
import { BackendLambdaRequest } from "../../gateway/src/types";
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

export declare type LambdaEvent =
  | {
      Records: Array<SQSMessage>;
    }
  | BackendLambdaRequest;

// See https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html
export declare type SQSMessage = {
  attributes: SQSMessageAttributes;
  awsRegion: string;
  body: string;
  eventSource: "aws:sqs";
  eventSourceARN: string;
  md5OfBody: string;
  messageAttributes: { [key: string]: { stringValue: string } };
  messageId: string;
  receiptHandle: string;
};

type SQSMessageAttributes = {
  ApproximateFirstReceiveTimestamp: string;
  ApproximateReceiveCount: string;
  SenderId: string;
  SentTimestamp: string;
} & Partial<SQSFifoMessageAttributes>;

type SQSFifoMessageAttributes = {
  MessageDeduplicationId: string;
  MessageGroupId: string;
  SequenceNumber: string;
};

export declare type SQSFifoMessage = SQSMessage & {
  attributes: SQSMessageAttributes & SQSFifoMessageAttributes;
};

import { SQS } from "@aws-sdk/client-sqs";
import { asFetchRequest } from "./asFetch";
import swapAWSEnvVars from "./environment";
import "./globals";
import handleSQSMessages, { SQSMessage } from "./handleSQSMessages";
import httpRoute from "./httpRoute";
import "./polyfill";
import createPushMessage from "./pushMessage";
export { default as loadModule } from "./loadModule";
export { displayServices, loadServices, Services } from "./loadServices";
export { createPushMessage };

const { branch, projectId, region, ...clientConfig } =
  process.env.NODE_ENV === "production"
    ? swapAWSEnvVars()
    : {
        branch: "main",
        projectId: "grumpy-sunshine",
        region: "localhost",
      };

const slug = `${projectId}-${branch}`;
const sqs = new SQS({ ...clientConfig, region });

export async function handler(
  event: LambdaEvent,
  context: LambdaContext
): Promise<BackendLambdaResponse | SQSBatchResponse | undefined> {
  const { getRemainingTimeInMillis } = context;
  global._qr.pushMessage = pushMessage;

  if ("url" in event) {
    return await asFetchRequest(event, (request) => httpRoute(request));
  } else if ("Records" in event) {
    const messages = event.Records.filter(
      (record) => record.eventSource === "aws:sqs"
    );
    if (messages.length === 0) return;

    const sqs = new SQS({ ...clientConfig, region });
    return await handleSQSMessages({
      getRemainingTimeInMillis,
      messages,
      sqs,
    });
  }
}

export const pushMessage = createPushMessage({ sqs, slug });

type LambdaEvent = { Records: Array<SQSMessage> } | BackendLambdaRequest;

type LambdaContext = {
  functionName: string;
  functionVersion: string;
  // The Amazon Resource Name (ARN) that's used to invoke the function. Indicates if the invoker specified a version number or alias.
  invokedFunctionArn: string;
  memoryLimitInMB: string;
  awsRequestId: string;
  logGroupName: string;
  getRemainingTimeInMillis: () => number;
  callbackWaitsForEmptyEventLoop: boolean;
};

type SQSBatchResponse = {
  // https://docs.aws.amazon.com/lambda/latest/dg/with-ddb.html#services-ddb-batchfailurereporting
  batchItemFailures: Array<{ itemIdentifier: string }>;
};

type BackendLambdaRequest = {
  body?: string;
  headers: Record<string, string>;
  method: string;
  requestId?: string;
  url: string;
};

type BackendLambdaResponse = {
  body: string;
  bodyEncoding: "text" | "base64";
  headers: Record<string, string>;
  statusCode: number;
};

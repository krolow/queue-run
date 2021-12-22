import { SQS } from "@aws-sdk/client-sqs";
import swapAWSEnvVars from "./environment";
import "./globals";
import handleHTTPRequest, {
  APIGatewayProxyResponse,
  BackendLambdaRequest,
} from "./http";
import {
  handleSQSMessages,
  pushMessage as pushMessage,
  SQSMessage,
} from "./queues";
export { default as loadModule } from "./loadModule";
export { displayServices, loadServices, Services } from "./loadServices";

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
): Promise<APIGatewayProxyResponse | SQSBatchResponse> {
  const { getRemainingTimeInMillis } = context;
  global.$queueRun = {
    pushMessage: (args) => pushMessage({ ...args, sqs, slug }),
  };

  if ("url" in event) return await handleHTTPRequest(event);

  if ("Records" in event) {
    const messages = event.Records.filter(
      (record) => record.eventSource === "aws:sqs"
    );

    const sqs = new SQS({ ...clientConfig, region });
    return await handleSQSMessages({
      getRemainingTimeInMillis,
      messages,
      sqs,
    });
  }

  throw new Error("Unknown event type");
}

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

import { SQS } from "@aws-sdk/client-sqs";
import { getLocalStorage } from "queue-run";
import swapAWSEnvVars from "./environment";
import handleHTTPRequest, {
  APIGatewayProxyResponse,
  BackendLambdaRequest,
} from "./http";
import {
  handleSQSMessages,
  pushMessage as pushMessage,
  SQSMessage,
} from "./queues";
import { SQSBatchResponse } from "./queues/handleSQSMessages";

const { slug, region, ...clientConfig } =
  process.env.NODE_ENV === "production"
    ? swapAWSEnvVars()
    : { slug: "localhost", region: "localhost" };

export async function handler(
  event: LambdaEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResponse | SQSBatchResponse> {
  const sqs = new SQS({ ...clientConfig, region });
  return await getLocalStorage().run(
    {
      pushMessage: (args) => pushMessage({ ...args, sqs, slug }),
    },
    async () => {
      if ("url" in event) return await handleHTTPRequest(event);

      if ("Records" in event) {
        const { getRemainingTimeInMillis } = context;
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
  );
}

export async function development(cb: () => Promise<void>) {
  const sqs = new SQS({ region: "localhost" });
  return await getLocalStorage().run(
    {
      pushMessage: (args) => pushMessage({ ...args, sqs, slug }),
    },
    cb
  );
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

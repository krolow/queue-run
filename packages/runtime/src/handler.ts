import { SQS } from "@aws-sdk/client-sqs";
import { LocalStorage } from "queue-run";
import swapAWSEnvVars from "./environment";
import handleHTTPRequest, {
  APIGatewayProxyResponse,
  BackendLambdaRequest,
} from "./http";
import { handleSQSMessages, pushMessage, SQSMessage } from "./queues";
import { SQSBatchResponse } from "./queues/handleSQSMessages";

const { slug, region, ...clientConfig } =
  process.env.NODE_ENV === "production"
    ? swapAWSEnvVars()
    : { slug: "localhost", region: "localhost" };

// Entry point for AWS Lambda
export async function handler(
  event: LambdaEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResponse | SQSBatchResponse> {
  const sqs = new SQS({ ...clientConfig, region });
  const newLocalStorage = bindNewLocalStorage({ sqs });

  if ("url" in event || "requestContext" in event)
    return await handleHTTPRequest(event, newLocalStorage);

  if ("Records" in event) {
    const { getRemainingTimeInMillis } = context;
    const messages = event.Records.filter(
      (record) => record.eventSource === "aws:sqs"
    );

    const sqs = new SQS({ ...clientConfig, region });
    return await handleSQSMessages({
      getRemainingTimeInMillis,
      messages,
      newLocalStorage,
      sqs,
    });
  }

  throw new Error("Unknown event type");
}

function bindNewLocalStorage({ sqs }: { sqs: SQS }) {
  return function (): LocalStorage {
    let user: { id: string } | null;
    return {
      pushMessage: (args) =>
        pushMessage({
          ...args,
          sqs,
          slug,
          user: args.user === undefined ? user : args.user,
        }),

      sendWebSocketMessage() {
        throw new Error("Not implemented");
      },

      setUser(newUser?: { id: string }) {
        if (user !== undefined) throw new Error("User already set");
        user = newUser ?? null;
      },
    };
  };
}

type LambdaEvent = { Records: Array<SQSMessage> } | BackendLambdaRequest;

type LambdaContext = {
  functionName: string;
  functionVersion: string;
  invokedFunctionArn: string;
  memoryLimitInMB: string;
  awsRequestId: string;
  logGroupName: string;
  getRemainingTimeInMillis: () => number;
  callbackWaitsForEmptyEventLoop: boolean;
};

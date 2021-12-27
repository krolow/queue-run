import { SQS } from "@aws-sdk/client-sqs";
import { LocalStorage } from "queue-run";
import swapAWSEnvVars from "./environment";
import handleHTTPRequest, {
  APIGatewayHTTPEvent,
  APIGatewayResponse,
  BackendLambdaRequest,
} from "./handleHTTPRequest";
import handleSQSMessages, {
  SQSBatchResponse,
  SQSMessage,
} from "./handleSQSMessages";
import handleWebSocketRequest, {
  APIGatewayWebSocketEvent,
} from "./handleWebSocket";
import queueJob from "./queueJob";

const { slug, region, ...clientConfig } = swapAWSEnvVars();

// Entry point for AWS Lambda
export async function handler(
  event: LambdaEvent,
  context: LambdaContext
): Promise<APIGatewayResponse | SQSBatchResponse> {
  console.info({ event, context });

  const sqs = new SQS({ ...clientConfig, region });
  const newLocalStorage = bindNewLocalStorage({
    sqs,
    urls: { http: process.env.QUEUE_RUN_URL!, ws: process.env.QUEUE_RUN_WS! },
  });

  if ("requestContext" in event) {
    if ("connectionId" in event.requestContext) {
      return await handleWebSocketRequest(
        event as APIGatewayWebSocketEvent,
        newLocalStorage
      );
    } else {
      return await handleHTTPRequest(
        event as APIGatewayHTTPEvent,
        newLocalStorage
      );
    }
  } else if ("url" in event) {
    return await handleHTTPRequest(event, newLocalStorage);
  } else if ("Records" in event) {
    const { getRemainingTimeInMillis } = context;
    const messages = event.Records.filter(
      (record) => record.eventSource === "aws:sqs"
    );

    return await handleSQSMessages({
      getRemainingTimeInMillis,
      messages,
      newLocalStorage,
      sqs,
    });
  } else throw new Error("Unknown event type");
}

function bindNewLocalStorage({
  sqs,
  urls,
}: {
  sqs: SQS;
  urls: {
    http: string;
    ws: string;
  };
}) {
  return function (): LocalStorage {
    let user: { id: string } | null;
    return {
      queueJob: (args) =>
        queueJob({
          ...args,
          sqs,
          slug,
          user: args.user === undefined ? user : args.user,
        }),

      sendWebSocketMessage() {
        throw new Error("Not implemented");
      },

      set user(newUser: { id: string } | null | undefined) {
        if (user !== undefined && user?.id !== newUser?.id)
          throw new Error("User already set");
        user = newUser ?? null;
      },

      urls,
    };
  };
}

type LambdaEvent =
  | APIGatewayHTTPEvent
  | APIGatewayWebSocketEvent
  | { Records: Array<SQSMessage> }
  | BackendLambdaRequest;

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

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
  const urls = {
    http: process.env.QUEUE_RUN_URL!,
    ws: process.env.QUEUE_RUN_WS!,
  };
  const newLocalStorage = () => new LambdaLocalStorage({ sqs, urls });

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

class LambdaLocalStorage extends LocalStorage {
  private sqs: SQS;

  constructor({ sqs, urls }: { sqs: SQS; urls: { http: string; ws: string } }) {
    super({ urls });
    this.sqs = sqs;
  }

  queueJob(args: Parameters<LocalStorage["queueJob"]>[0]) {
    return queueJob({
      ...args,
      sqs: this.sqs,
      slug,
      user: args.user === undefined ? this.user : args.user,
    });
  }
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

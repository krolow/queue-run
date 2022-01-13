import { SQS } from "@aws-sdk/client-sqs";
import { format } from "node:util";
import { LocalStorage, logging, warmup } from "queue-run";
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

const sqs = new SQS({ ...clientConfig, region });
const urls = {
  http: process.env.QUEUE_RUN_URL!,
  ws: process.env.QUEUE_RUN_WS!,
};

logging((level, args) => {
  const formatted = format(...args).replace(/\n/g, "\r");
  process.stdout.write(formatted + "\n");
});

class LambdaLocalStorage extends LocalStorage {
  private sqs: SQS;

  constructor({ sqs, urls }: { sqs: SQS; urls: { http: string; ws: string } }) {
    super({ urls });
    this.sqs = sqs;
  }

  queueJob(args: Parameters<LocalStorage["queueJob"]>[0]) {
    const { dedupeId, groupId, params, payload, queueName, user } = args;
    return queueJob({
      dedupeId,
      groupId,
      params,
      payload,
      queueName,
      sqs: this.sqs,
      slug,
      user: user === undefined ? this.user : user,
    });
  }
}

// Top-level await: this only makes a difference if you user provisioned concurrency
await warmup(new LambdaLocalStorage({ sqs, urls }));

// Entry point for AWS Lambda
export async function handler(
  event: LambdaEvent,
  context: LambdaContext
): Promise<APIGatewayResponse | SQSBatchResponse | undefined> {
  console.info({ event, context });

  const newLocalStorage = () => new LambdaLocalStorage({ sqs, urls });

  if (isWebSocketRequest(event))
    return await handleWebSocketRequest(
      event as APIGatewayWebSocketEvent,
      newLocalStorage
    );

  if (isHTTPRequest(event))
    return await handleHTTPRequest(event, newLocalStorage);

  if (isSQSMessages(event)) {
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
  }

  throw new Error("Unknown event type");
}

function isWebSocketRequest(
  event: LambdaEvent
): event is APIGatewayWebSocketEvent {
  return "requestContext" in event && "connectionId" in event.requestContext;
}

function isHTTPRequest(event: LambdaEvent): event is APIGatewayHTTPEvent {
  return "requestContext" in event && "http" in event.requestContext;
}

function isSQSMessages(event: LambdaEvent): event is { Records: SQSMessage[] } {
  return (
    "Records" in event &&
    event.Records.every((record) => record.eventSource === "aws:sqs")
  );
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

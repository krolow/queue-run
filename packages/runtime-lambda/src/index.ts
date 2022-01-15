import {
  ApiGatewayManagementApiClient,
  DeleteConnectionCommand,
  PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";
import { SQSClient } from "@aws-sdk/client-sqs";
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

logging((level, args) => {
  const formatted = format(...args);
  process.stdout.write(
    `[${level.toUpperCase()}] ${formatted.replace(/\n/g, "\r")}\n`
  );
});

const urls = {
  http: process.env.QUEUE_RUN_URL!,
  ws: process.env.QUEUE_RUN_WS!,
};
const { slug, region, ...clientConfig } = swapAWSEnvVars();

const sqs = new SQSClient({ ...clientConfig, region });
const gateway = new ApiGatewayManagementApiClient({
  ...clientConfig,
  endpoint: urls.ws.replace("wss://", "https://"),
  region,
});

class LambdaLocalStorage extends LocalStorage {
  constructor() {
    super({ urls });
  }

  queueJob(args: Parameters<LocalStorage["queueJob"]>[0]) {
    const { dedupeId, groupId, params, payload, queueName, user } = args;
    return queueJob({
      dedupeId,
      groupId,
      params,
      payload,
      queueName,
      sqs,
      slug,
      user: user === undefined ? this.user : user,
    });
  }

  async sendWebSocketMessage(
    message: Buffer,
    connection: string
  ): Promise<void> {
    await gateway.send(
      new PostToConnectionCommand({ ConnectionId: connection, Data: message })
    );
  }

  async closeWebSocket(connection: string): Promise<void> {
    await gateway.send(
      new DeleteConnectionCommand({ ConnectionId: connection })
    );
  }

  // eslint-disable-next-line no-unused-vars
  getConnections(userIds: string[]): Promise<string[]> {
    throw new Error("Not implemented yet");
  }
}

// Top-level await: this only makes a difference if you user provisioned concurrency
await warmup(new LambdaLocalStorage());

// Entry point for AWS Lambda
export async function handler(
  event: LambdaEvent,
  context: LambdaContext
): Promise<APIGatewayResponse | SQSBatchResponse | undefined> {
  const newLocalStorage = () => new LambdaLocalStorage();

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

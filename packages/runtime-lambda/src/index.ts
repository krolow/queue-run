import {
  ApiGatewayManagementApiClient,
  DeleteConnectionCommand,
  PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { SQSClient } from "@aws-sdk/client-sqs";
import { format } from "node:util";
import {
  AuthenticatedUser,
  getLocalStorage,
  handleUserOnline,
  LocalStorage,
  logger,
  warmup,
} from "queue-run";
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
import userConnections from "./userConnections";

logger((level, ...args) => {
  const formatted = format(...args);
  process.stdout.write(
    `[${level.toUpperCase()}] ${formatted.replace(/\n/g, "\r")}\n`
  );
});

const urls = {
  http: process.env.QUEUE_RUN_URL!,
  ws: process.env.QUEUE_RUN_WS!,
};
const { slug, region, wsApiId, ...clientConfig } = swapAWSEnvVars();

const dynamoDB = new DynamoDBClient({ ...clientConfig, region });
const gateway = new ApiGatewayManagementApiClient({
  ...clientConfig,
  endpoint: `https://${wsApiId}.execute-api.${region}.amazonaws.com/prod`,
  region,
});
const sqs = new SQSClient({ ...clientConfig, region });

const connections = userConnections(dynamoDB);

class LambdaLocalStorage extends LocalStorage {
  constructor(connectionId?: string) {
    super({ urls });
    this.connectionId = connectionId;
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
      user: (user === undefined ? this.user : user) ?? null,
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
  async getConnections(userIds: string[]): Promise<string[]> {
    return await connections.getConnections(userIds);
  }

  async authenticated(user: AuthenticatedUser | null) {
    super.authenticated(user);
    if (this.user && this.connectionId) {
      const userId = this.user.id;
      const { wentOnline } = await connections.onAuthenticated({
        connectionId: this.connectionId,
        userId,
      });
      if (wentOnline) {
        getLocalStorage().exit(() =>
          handleUserOnline({
            userId,
            newLocalStorage: () => new LambdaLocalStorage(),
          })
        );
      }
    }
  }
}

// Top-level await: this only makes a difference if you user provisioned concurrency
await warmup(new LambdaLocalStorage());

// Entry point for AWS Lambda
export async function handler(
  event: LambdaEvent,
  context: LambdaContext
): Promise<APIGatewayResponse | SQSBatchResponse | void> {
  if (isWebSocketRequest(event)) {
    const { connectionId } = event.requestContext;
    const newLocalStorage = () => new LambdaLocalStorage(connectionId);
    return await handleWebSocketRequest(
      event as APIGatewayWebSocketEvent,
      connections,
      newLocalStorage
    );
  }

  if (isHTTPRequest(event)) {
    const newLocalStorage = () => new LambdaLocalStorage();
    return await handleHTTPRequest(event, newLocalStorage);
  }

  if (isSQSMessages(event)) {
    const newLocalStorage = () => new LambdaLocalStorage();
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

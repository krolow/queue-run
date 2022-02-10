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
  socket,
  url,
  warmup,
} from "queue-run";
import swapAWSEnvVars from "./environment";
import handleHTTPRequest, {
  APIGatewayHTTPEvent,
  APIGatewayResponse,
  BackendLambdaRequest,
} from "./handleHTTPRequest";
import handleScheduledEvent, { ScheduledEvent } from "./handleScheduledEvent";
import handleSQSMessages, {
  SQSBatchResponse,
  SQSMessage,
} from "./handleSQSMessages";
import handleWebSocketRequest, {
  APIGatewayWebSocketEvent,
} from "./handleWebSocket";
import queueJob from "./queueJob";
import userConnections from "./userConnections";

logger.removeAllListeners("log");
logger.addListener("log", (level, ...args) => {
  const formatted = format(...args);
  process.stdout.write(
    `[${level.toUpperCase()}] ${formatted.replace(/\n/g, "\r")}\n`
  );
});

url.baseUrl = process.env.QUEUE_RUN_URL!;
socket.url = process.env.QUEUE_RUN_WS!;

const { slug, region, wsApiId, ...clientConfig } = swapAWSEnvVars();

const dynamoDB = new DynamoDBClient({ ...clientConfig, region });
const gateway = new ApiGatewayManagementApiClient({
  ...clientConfig,
  endpoint: `https://${wsApiId}.execute-api.${region}.amazonaws.com/_ws`,
  region,
});
const sqs = new SQSClient({ ...clientConfig, region });

const connections = userConnections(dynamoDB);

class LambdaLocalStorage extends LocalStorage {
  constructor(connectionId?: string) {
    super();
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
      user: user === undefined ? this.user ?? null : user,
    });
  }

  async sendWebSocketMessage(
    message: Buffer,
    connectionId: string
  ): Promise<void> {
    try {
      await gateway.send(
        new PostToConnectionCommand({
          ConnectionId: connectionId,
          Data: message,
        })
      );
    } catch (error) {
      if (error && typeof error === "object" && "$metadata" in error) {
        const { httpStatusCode } = (
          error as { $metadata: { httpStatusCode: number } }
        ).$metadata;
        // 410 Gone: this connection has been closed
        // 403 Forbidden: this connection belongs to different API
        // (this could happend if you add/remove domain)
        if (httpStatusCode === 410 || httpStatusCode === 403)
          connections.onDisconnected(connectionId);
      } else throw error;
    }
  }

  async closeWebSocket(connectionId: string): Promise<void> {
    await gateway.send(
      new DeleteConnectionCommand({ ConnectionId: connectionId })
    );
  }

  // eslint-disable-next-line no-unused-vars
  async getConnections(userIds: string[]): Promise<string[]> {
    return await connections.getConnections(userIds);
  }

  async authenticated(user: AuthenticatedUser | null) {
    super.authenticated(user);
    const { connectionId } = this;
    if (user && connectionId) {
      const { wentOnline } = await connections.onAuthenticated({
        connectionId,
        userId: user.id,
      });
      if (wentOnline) {
        getLocalStorage().exit(() =>
          handleUserOnline({
            user,
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

  if (isScheduledEvent(event)) {
    const newLocalStorage = () => new LambdaLocalStorage();
    return await handleScheduledEvent(event, newLocalStorage);
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

function isScheduledEvent(event: LambdaEvent): event is ScheduledEvent {
  return (
    "source" in event &&
    (event.source === "aws.events" || event.source === "cli.schedule")
  );
}

type LambdaEvent =
  | APIGatewayHTTPEvent
  | APIGatewayWebSocketEvent
  | { Records: Array<SQSMessage> }
  | BackendLambdaRequest
  | ScheduledEvent;

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

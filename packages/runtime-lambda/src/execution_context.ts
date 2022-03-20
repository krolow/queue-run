import {
  ApiGatewayManagementApiClient,
  DeleteConnectionCommand,
  PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";
import {
  BatchGetItemCommand,
  DeleteItemCommand,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { SQSClient } from "@aws-sdk/client-sqs";
import type { Credentials } from "@aws-sdk/types";
import {
  AuthenticatedUser,
  ExecutionContext,
  getExecutionContext,
  handleUserOnline,
  NewExecutionContext,
} from "queue-run";
import queueJob from "./queueJob";

const credentials: Credentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  sessionToken: process.env.AWS_SESSION_TOKEN,
};
const slug = process.env.AWS_LAMBDA_FUNCTION_NAME!;
const region = process.env.AWS_REGION!;
const gateway = new ApiGatewayManagementApiClient({
  credentials,
  endpoint: `https://${process.env.QUEUE_RUN_WS_API_ID}.execute-api.${region}.amazonaws.com/_ws`,
  region,
});
const dynamoDB = new DynamoDBClient({ credentials, region });
export const sqs = new SQSClient({ credentials, region });

/**
 * This table holds the open connections for each authenticated user.
 *
 * id - authenticated user ID (PK)
 * connections - list of connection IDs
 *
 * We need this to send messages to all the devices the user has connected,
 * and determine when the user goes online/offline.
 */
const userConnectionsTable = `${slug}-user-connections`;
/**
 * This table holds the authenticated user ID for each connection
 *
 * id - connection ID (PK)
 * user_id - authenticated user ID
 *
 * There would be multiple records if the user has multiple connections from
 * different devices. No record if the client is not authenticated.
 */
const connectionsTable = `${slug}-connections`;

export default class LambdaExecutionContext extends ExecutionContext {
  constructor(
    args: { connectionId?: string } & Parameters<NewExecutionContext>[0]
  ) {
    super(args);
    this.connectionId = args.connectionId;
  }

  queueJob(args: Parameters<ExecutionContext["queueJob"]>[0]) {
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
          LambdaExecutionContext.onDisconnected(connectionId);
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
    const { Responses } = await dynamoDB.send(
      new BatchGetItemCommand({
        RequestItems: {
          [userConnectionsTable]: {
            Keys: userIds.map((id) => ({ id: { S: id } })),
          },
        },
      })
    );
    const records = Responses?.[userConnectionsTable] ?? [];
    return records.flatMap((record) => record.connections?.SS ?? []) ?? [];
  }

  async authenticated(user: AuthenticatedUser | null) {
    super.authenticated(user);
    const { connectionId } = this;
    if (user && connectionId) {
      const { wentOnline } = await this.onAuthenticated({
        connectionId,
        userId: user.id,
      });
      if (wentOnline) {
        getExecutionContext().exit(() =>
          handleUserOnline({
            user,
            newExecutionContext: (args) => new LambdaExecutionContext(args),
          })
        );
      }
    }
  }

  static async getAuthenticatedUserId(
    connectionId: string
  ): Promise<string | null | undefined> {
    const user = await dynamoDB.send(
      new GetItemCommand({
        TableName: connectionsTable,
        Key: { id: { S: connectionId } },
      })
    );
    return user?.Item?.user_id?.S;
  }

  private async onAuthenticated({
    connectionId,
    userId,
  }: {
    connectionId: string;
    userId: string;
  }): Promise<{ wentOnline: boolean }> {
    const [, { Attributes }] = await Promise.all([
      dynamoDB.send(
        new PutItemCommand({
          TableName: connectionsTable,
          Item: {
            id: { S: connectionId },
            user_id: { S: userId },
            timestamp: { N: Date.now().toString() },
          },
        })
      ),

      dynamoDB.send(
        new UpdateItemCommand({
          TableName: userConnectionsTable,
          Key: { id: { S: userId } },
          UpdateExpression: "ADD connections :connection",
          ExpressionAttributeValues: { ":connection": { SS: [connectionId] } },
          ReturnValues: "ALL_OLD",
        })
      ),
    ]);

    const wentOnline = !Attributes;
    return { wentOnline };
  }

  static async onDisconnected(
    connectionId: string
  ): Promise<
    | { wentOffline: false; userId?: never }
    | { wentOffline: true; userId: string }
  > {
    const connection = await dynamoDB.send(
      new DeleteItemCommand({
        TableName: connectionsTable,
        Key: { id: { S: connectionId } },
        ReturnValues: "ALL_OLD",
      })
    );
    const userId = connection.Attributes?.user_id?.S;
    if (!userId) return { wentOffline: false };

    const connections = await dynamoDB.send(
      new UpdateItemCommand({
        TableName: userConnectionsTable,
        Key: { id: { S: userId } },
        UpdateExpression: "DELETE connections :connection",
        ExpressionAttributeValues: { ":connection": { SS: [connectionId] } },
        ReturnValues: "ALL_NEW",
      })
    );

    // Some connections left open
    if (
      connections.Attributes?.connections?.SS &&
      connections.Attributes.connections.SS.length > 0
    )
      return { wentOffline: false };

    // Delete the record with zero connections, but don't stress if we fail
    dynamoDB
      .send(
        new DeleteItemCommand({
          TableName: userConnectionsTable,
          Key: { id: { S: userId } },
          ConditionExpression: "attribute_not_exists(connections)",
        })
      )
      .catch(console.error);

    return { wentOffline: true, userId };
  }
}

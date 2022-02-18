import {
  ApiGatewayManagementApiClient,
  DeleteConnectionCommand,
  PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";
import { SQSClient } from "@aws-sdk/client-sqs";
import {
  AuthenticatedUser,
  ExecutionContext,
  getExecutionContext,
  handleUserOnline,
  NewExecutionContext,
} from "queue-run";
import queueJob from "./queueJob";
import * as userConnections from "./user_connections";

const slug = process.env.AWS_LAMBDA_FUNCTION_NAME!;
const region = process.env.AWS_REGION!;
const gateway = new ApiGatewayManagementApiClient({
  endpoint: `https://${process.env.QUEUE_RUN_WS_API_ID}.execute-api.${region}.amazonaws.com/_ws`,
  region,
});
const sqs = new SQSClient({ region });

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
          userConnections.onDisconnected(connectionId);
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
    return await userConnections.getConnections(userIds);
  }

  async authenticated(user: AuthenticatedUser | null) {
    super.authenticated(user);
    const { connectionId } = this;
    if (user && connectionId) {
      const { wentOnline } = await userConnections.onAuthenticated({
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
}

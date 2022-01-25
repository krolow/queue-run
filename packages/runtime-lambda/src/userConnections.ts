import {
  BatchGetItemCommand,
  DeleteItemCommand,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";

export default function userConnections(dynamoDB: DynamoDBClient) {
  return {
    getConnections: (userIds: string[]) =>
      getConnections({ dynamoDB, userIds }),
    getAuthenticatedUserId: (connectionId: string) =>
      getAuthenticatedUserId({ dynamoDB, connectionId }),
    onAuthenticated: ({
      connectionId,
      userId,
    }: {
      connectionId: string;
      userId: string;
    }) => onAuthenticated({ dynamoDB, connectionId, userId }),
    onDisconnected: (connectionId: string) =>
      onDisconnected({ dynamoDB, connectionId }),
  };
}

/**
 * This table holds the authenticated user ID for each connection
 *
 * id - connection ID (PK)
 * user_id - authenticated user ID
 *
 * There would be multiple records if the user has multiple connections from
 * different devices. No record if the client is not authenticated.
 */
const connectionsTable = "qr-connections";

/**
 * This table holds the open connections for each authenticated user.
 *
 * id - authenticated user ID (PK)
 * connections - list of connection IDs
 *
 * We need this to send messages to all the devices the user has connected,
 * and determine when the user goes online/offline.
 */
const userConnectionsTable = "qr-user-connections";

async function getConnections({
  dynamoDB,
  userIds,
}: {
  dynamoDB: DynamoDBClient;
  userIds: string[];
}): Promise<string[]> {
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

async function getAuthenticatedUserId({
  dynamoDB,
  connectionId,
}: {
  dynamoDB: DynamoDBClient;
  connectionId: string;
}): Promise<string | null | undefined> {
  const user = await dynamoDB.send(
    new GetItemCommand({
      TableName: connectionsTable,
      Key: { id: { S: connectionId } },
    })
  );
  return user?.Item?.user_id?.S;
}

async function onAuthenticated({
  dynamoDB,
  connectionId,
  userId,
}: {
  dynamoDB: DynamoDBClient;
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

async function onDisconnected({
  dynamoDB,
  connectionId,
}: {
  dynamoDB: DynamoDBClient;
  connectionId: string;
}): Promise<
  { wentOffline: false; userId?: never } | { wentOffline: true; userId: string }
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

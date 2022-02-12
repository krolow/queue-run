import {
  handleUserOffline,
  handleWebSocketConnect,
  handleWebSocketMessage,
  Headers,
  NewExecutionContext,
} from "queue-run";
import { APIGatewayResponse } from "./handleHTTPRequest";
import type userConnections from "./userConnections";

export default async function handleWebSocketRequest(
  event: APIGatewayWebSocketEvent,
  connections: ReturnType<typeof userConnections>,
  newLocalStorage: NewExecutionContext
): Promise<APIGatewayResponse | void> {
  switch (event.requestContext.eventType) {
    case "CONNECT":
      return await connect(event, connections, newLocalStorage);
    case "DISCONNECT":
      return await disconnect(event, connections, newLocalStorage);
    case "MESSAGE":
      return await onMessage(event, connections, newLocalStorage);
  }
}

async function connect(
  event: APIGatewayWebSocketEvent,
  connections: ReturnType<typeof userConnections>,
  newExecutionContext: NewExecutionContext
): Promise<APIGatewayResponse> {
  const url = `wss://${event.requestContext.domainName}${event.requestContext.stage}`;
  const request = new Request(url, {
    headers: new Headers(event.headers),
  });
  const { connectionId, requestId } = event.requestContext;
  try {
    const response = await handleWebSocketConnect({
      connectionId,
      newExecutionContext,
      request,
      requestId,
    });

    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => (headers[key] = value));
    return {
      body: await response.text(),
      headers,
      isBase64Encoded: false,
      statusCode: response.status,
    };
  } catch (error) {
    console.error(error);
    return {
      body: "Internal Server Error",
      headers: {},
      isBase64Encoded: false,
      statusCode: 500,
    };
  }
}

async function onMessage(
  event: APIGatewayWebSocketEvent,
  connections: ReturnType<typeof userConnections>,
  newExecutionContext: NewExecutionContext
): Promise<APIGatewayResponse> {
  const data = Buffer.from(
    event.body ?? "",
    event.isBase64Encoded ? "base64" : "utf-8"
  );
  try {
    const { connectionId } = event.requestContext;
    const userId = await connections.getAuthenticatedUserId(connectionId);

    await handleWebSocketMessage({
      connectionId: connectionId,
      data,
      newExecutionContext,
      requestId: event.requestContext.requestId,
      userId,
    });
    return {
      headers: {},
      isBase64Encoded: false,
      statusCode: 200,
    };
  } catch (error) {
    return {
      body: String(error),
      headers: {},
      isBase64Encoded: false,
      statusCode: 500,
    };
  }
}

async function disconnect(
  event: APIGatewayWebSocketEvent,
  connections: ReturnType<typeof userConnections>,
  newExecutionContext: NewExecutionContext
): Promise<APIGatewayResponse> {
  const { connectionId } = event.requestContext;
  const { wentOffline, userId } = await connections.onDisconnected(
    connectionId
  );
  if (wentOffline && userId)
    await handleUserOffline({
      user: { id: userId },
      newExecutionContext,
    });
  return {
    headers: {},
    isBase64Encoded: false,
    statusCode: 200,
  };
}

export type APIGatewayWebSocketEvent = {
  body?: string;
  headers: { [key: string]: string };
  isBase64Encoded: boolean;
  requestContext: {
    connectionId: string;
    domainName: string;
    eventType: "CONNECT" | "DISCONNECT" | "MESSAGE";
    http: never;
    identity: { sourceIp: string };
    requestId: string;
    routeKey: "$connect" | "$disconnect" | "$default";
    stage: string;
  };
};

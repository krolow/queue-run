import {
  authenticateWebSocket,
  handleUserOffline,
  handleUserOnline,
  handleWebSocketMessage,
  Headers,
  LocalStorage,
  Request,
  Response,
} from "queue-run";
import { APIGatewayResponse } from "./handleHTTPRequest";
import type userConnections from "./userConnections";

export default async function handleWebSocketRequest(
  event: APIGatewayWebSocketEvent,
  connections: ReturnType<typeof userConnections>,
  newLocalStorage: () => LocalStorage
): Promise<APIGatewayResponse | void> {
  switch (event.requestContext.eventType) {
    case "CONNECT":
      return await authenticate(event, connections, newLocalStorage);
    case "DISCONNECT":
      return await disconnect(event, connections, newLocalStorage);
    case "MESSAGE":
      return await onMessage(event, connections, newLocalStorage);
  }
}

async function authenticate(
  event: APIGatewayWebSocketEvent,
  connections: ReturnType<typeof userConnections>,
  newLocalStorage: () => LocalStorage
): Promise<APIGatewayResponse | undefined> {
  const url = `wss://${event.requestContext.domainName}${event.requestContext.stage}`;
  const request = new Request(url, {
    headers: new Headers(event.headers),
  });
  try {
    const user = await authenticateWebSocket({ newLocalStorage, request });

    if (user) {
      const { connectionId } = event.requestContext;
      const { wentOnline } = await connections.onAuthenticated({
        connectionId,
        userId: user.id,
      });
      if (wentOnline)
        await handleUserOnline({ userId: user.id, newLocalStorage });
    }

    return {
      body: "",
      headers: {},
      isBase64Encoded: false,
      statusCode: 200,
    };
  } catch (error) {
    if (error instanceof Response) {
      return {
        body: await error.text(),
        headers: Object.fromEntries(Array.from(error.headers.entries())),
        isBase64Encoded: false,
        statusCode: error.status ?? 403,
      };
    } else {
      console.error(error);
      return {
        body: "Internal Server Error",
        headers: {},
        isBase64Encoded: false,
        statusCode: 500,
      };
    }
  }
}

async function onMessage(
  event: APIGatewayWebSocketEvent,
  connections: ReturnType<typeof userConnections>,
  newLocalStorage: () => LocalStorage
): Promise<APIGatewayResponse | undefined> {
  const data = Buffer.from(
    event.body ?? "",
    event.isBase64Encoded ? "base64" : "utf-8"
  );
  try {
    const { connectionId } = event.requestContext;
    const userId = await connections.getAuthenticatedUserId(connectionId);

    await handleWebSocketMessage({
      connection: connectionId,
      data,
      newLocalStorage,
      requestId: event.requestContext.requestId,
      userId,
    });
    return {
      body: "",
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
  newLocalStorage: () => LocalStorage
): Promise<void> {
  const { connectionId } = event.requestContext;
  const { wentOffline, userId } = await connections.onDisconnected(
    connectionId
  );
  if (wentOffline && userId)
    await handleUserOffline({ userId, newLocalStorage });
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

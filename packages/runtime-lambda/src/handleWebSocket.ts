import {
  authenticateWebSocket,
  handleWebSocketMessage,
  Headers,
  LocalStorage,
  Request,
  Response,
} from "queue-run";
import { APIGatewayResponse } from "./handleHTTPRequest";

export default async function handleWebSocketRequest(
  event: APIGatewayWebSocketEvent,
  newLocalStorage: () => LocalStorage
): Promise<APIGatewayResponse | undefined> {
  switch (event.requestContext.eventType) {
    case "CONNECT":
      return await authenticate(event, newLocalStorage);
    case "DISCONNECT": {
      return {
        body: "",
        headers: {},
        isBase64Encoded: false,
        statusCode: 204,
      };
    }
    case "MESSAGE":
      return await onMessage(event, newLocalStorage);
  }
}

async function authenticate(
  event: APIGatewayWebSocketEvent,
  newLocalStorage: () => LocalStorage
): Promise<APIGatewayResponse | undefined> {
  const url = `wss://${event.requestContext.domainName}${event.requestContext.stage}`;
  const request = new Request(url, {
    headers: new Headers(event.headers),
  });
  try {
    const user = await authenticateWebSocket({ newLocalStorage, request });
    return {
      body: user?.id ?? "anoynmous",
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
  newLocalStorage: () => LocalStorage
): Promise<APIGatewayResponse | undefined> {
  const connection = event.requestContext.connectionId;
  const data = Buffer.from(
    event.body ?? "",
    event.isBase64Encoded ? "base64" : "utf-8"
  );
  try {
    await handleWebSocketMessage({
      connection,
      data,
      newLocalStorage,
      requestId: event.requestContext.requestId,
      userId: null,
    });
    return undefined;
  } catch (error) {
    return {
      body: String(error),
      headers: {},
      isBase64Encoded: false,
      statusCode: 500,
    };
  }
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

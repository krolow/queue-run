import { handleWebSocketMessage, LocalStorage } from "queue-run";
import { APIGatewayResponse } from "./handleHTTPRequest";

export default async function handleWebSocketRequest(
  event: APIGatewayWebSocketEvent,
  newLocalStorage: () => LocalStorage
): Promise<APIGatewayResponse | undefined> {
  const connection = event.requestContext.connectionId;
  switch (event.requestContext.eventType) {
    case "CONNECT": {
      return {
        body: "",
        headers: {},
        isBase64Encoded: false,
        statusCode: 200,
      };
    }
    case "DISCONNECT": {
      return {
        body: "",
        headers: {},
        isBase64Encoded: false,
        statusCode: 204,
      };
    }
    case "MESSAGE": {
      const data = Buffer.from(
        event.body ?? "",
        event.isBase64Encoded ? "base64" : "utf-8"
      );
      const response = await handleWebSocketMessage({
        connection,
        data,
        newLocalStorage,
        userId: null,
      });
      return response
        ? {
            body: response.toString(),
            headers: {},
            isBase64Encoded: false,
            statusCode: 200,
          }
        : undefined;
    }
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
    routeKey: "$connect" | "$disconnect" | "$default";
    stage: string;
  };
};

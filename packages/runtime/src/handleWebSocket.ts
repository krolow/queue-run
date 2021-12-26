import { LocalStorage } from "queue-run";
import { APIGatewayResponse } from "./handleHTTPRequest";

export default async function handleWebSocketRequest(
  event: APIGatewayWebSocketEvent,
  newLocalStorage: () => LocalStorage
): Promise<APIGatewayResponse> {
  return {
    statusCode: 200,
    body: "OK",
    isBase64Encoded: false,
    headers: {},
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
    routeKey: "$connect" | "$disconnect" | "$default";
    stage: "$default";
  };
};

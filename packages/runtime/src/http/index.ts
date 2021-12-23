import type { LocalStorage } from "queue-run";
import { asFetchRequest } from "./asFetch";
import handleHTTPRequest from "./handleHTTPRequest";

export default async function (
  event: BackendLambdaRequest | APIGatewayProxyEvent,
  newLocalStorage: () => LocalStorage
): Promise<APIGatewayProxyResponse> {
  return await asFetchRequest(event, (request) =>
    handleHTTPRequest({ newLocalStorage, request })
  );
}

// https://docs.aws.amazon.com/lambda/latest/dg/services-apigateway.html#apigateway-example-event
export type APIGatewayProxyEvent = {
  requestContext: {
    domainName: string;
    httpMethod: string;
    path: string;
  };
  headers: { [key: string]: string };
  body?: string;
  isBase64Encoded: boolean;
};

export type APIGatewayProxyResponse = {
  body: string;
  bodyEncoding: "text" | "base64";
  headers: Record<string, string>;
  statusCode: number;
};

export type BackendLambdaRequest = {
  body?: string;
  headers: Record<string, string>;
  method: string;
  requestId?: string;
  url: string;
};

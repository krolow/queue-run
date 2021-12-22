import { asFetchRequest } from "./asFetch";
import httpRoute from "./httpRoute";

export default async function (
  event: BackendLambdaRequest
): Promise<BackendLambdaResponse> {
  return await asFetchRequest(event, (request) => httpRoute(request));
}

export type BackendLambdaRequest = {
  body?: string;
  headers: Record<string, string>;
  method: string;
  requestId?: string;
  url: string;
};

export type BackendLambdaResponse = {
  body: string;
  bodyEncoding: "text" | "base64";
  headers: Record<string, string>;
  statusCode: number;
};

import { asFetchRequest } from "./asFetch";
import handleHTTPRequest from "./handleHTTPRequest";

export default async function (
  event: BackendLambdaRequest
): Promise<BackendLambdaResponse> {
  return await asFetchRequest(event, (request) => handleHTTPRequest(request));
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

import { AbortController } from "@aws-sdk/abort-controller";
import { DynamoDB } from "@aws-sdk/client-dynamodb";
import { Lambda } from "@aws-sdk/client-lambda";
import { URL } from "url";
import type {
  APIGatewayEvent,
  APIGatewayResponse,
  BackendLambdaRequest,
  BackendLambdaResponse,
} from "./types";

const lambda = new Lambda({});
const dynamoDB = new DynamoDB({});
const requestTimeout = 5 * 1000;

export async function handler(
  event: APIGatewayEvent
): Promise<APIGatewayResponse> {
  try {
    const project = await getProject(event);

    if (event.requestContext.http.method === "GET" && event.rawPath === "/")
      return redirectToDashboard(project);
    else return await invokeBackend(event, project);
  } catch (error) {
    if (error instanceof StatusCodeError) {
      return {
        body: error.message,
        headers: {},
        isBase64Encoded: false,
        statusCode: error.statusCode,
      };
    } else {
      console.error("Gateway error", error);
      return {
        body: "Bad gateway",
        headers: {},
        isBase64Encoded: false,
        statusCode: 502,
      };
    }
  }
}

class StatusCodeError extends Error {
  constructor(public message: string, public statusCode: number) {
    super(`Status code ${statusCode}`);
  }
}

export default async function getProject(request: APIGatewayEvent): Promise<{
  id: string;
  branch: string;
}> {
  const subdomain = request.headers.host?.split(".")[0];
  if (!subdomain) throw new StatusCodeError("Not found", 404);

  const [_0, project, _1, branch] =
    subdomain.match(/^([a-z]+-[a-z]+)((?:-)(.*))?$/) ?? [];
  if (!project) throw new StatusCodeError("Not found", 404);

  const { Items: items } = await dynamoDB.executeStatement({
    Statement: "SELECT id, default_branch FROM projects WHERE id = ?",
    Parameters: [{ S: project }],
  });
  const fromDB = items?.[0];
  if (!fromDB) throw new StatusCodeError("Not found", 404);

  return {
    id: project,
    branch: branch ?? fromDB.default_branch?.S ?? "main",
  };
}

async function invokeBackend(
  event: APIGatewayEvent,
  project: { id: string; branch: string }
): Promise<APIGatewayResponse> {
  const lambdaName = `backend-${project.id}`;
  const aliasName = `${lambdaName}:${lambdaName}-${project.branch}`;
  console.info("Inovking backend lambda %s", aliasName);

  const controller = new AbortController();
  const timeout = setTimeout(function () {
    controller.abort();
  }, requestTimeout);

  try {
    const {
      StatusCode: statusCode,
      Payload: payload,
      FunctionError,
    } = await lambda.invoke(
      {
        FunctionName: aliasName,
        InvocationType: "RequestResponse",
        Payload: toRequestPayload(event),
      },
      { abortSignal: controller.signal }
    );

    if (statusCode === 200 && payload) return fromResponsePayload(payload);
    else if (controller.signal.aborted)
      throw new StatusCodeError("Gateway timeout", 504);
    else if (FunctionError) throw new StatusCodeError(FunctionError, 500);
    else throw new StatusCodeError("Internal server error", 500);
  } catch (error) {
    if (error instanceof Error && error.name === "ResourceNotFoundException")
      throw new StatusCodeError("Not found", 404);
    else throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function toRequestPayload(event: APIGatewayEvent): Uint8Array {
  const body = event.isBase64Encoded
    ? event.body
    : event.body
    ? Buffer.from(event.body).toString("base64")
    : undefined;

  const request: BackendLambdaRequest = {
    body,
    headers: event.headers,
    method: event.requestContext.http.method,
    requestId: event.requestContext.requestId,
    url: new URL(
      event.requestContext.http.path,
      `https://${event.headers.host}`
    ).href,
  };
  return Buffer.from(JSON.stringify(request));
}

function fromResponsePayload(payload: Uint8Array): APIGatewayResponse {
  try {
    const response = JSON.parse(
      Buffer.from(payload).toString("utf8")
    ) as BackendLambdaResponse;
    return {
      body: response.body,
      headers: response.headers ?? {},
      isBase64Encoded: true,
      statusCode: response.statusCode ?? 200,
    };
  } catch (error) {
    console.info("Failed to parse response", error);
    throw new StatusCodeError("Bad gateway", 502);
  }
}

function redirectToDashboard(project: {
  id: string;
  branch: string;
}): APIGatewayResponse {
  const dashboardURL = new URL(
    `/project/${project.id}/branch/${project.branch}`,
    "https://queue.run"
  ).href;
  return {
    body: `See ${dashboardURL}`,
    headers: { Location: dashboardURL },
    isBase64Encoded: false,
    statusCode: 303,
  };
}

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
    if (!project) return status("Project not found", 404);

    if (event.requestContext.http.method === "GET" && event.rawPath === "/")
      return redirectToDashboard(project);

    return await invokeBackend(event, project);
  } catch (error) {
    if (error instanceof Error && error.name === "AccessDeniedException")
      return status("No endpoint", 404);

    console.error("Gateway error", error);
    return status("Internal server error", 500);
  }
}

function status(message: string, statusCode: number): APIGatewayResponse {
  return {
    body: message,
    headers: {},
    isBase64Encoded: false,
    statusCode,
  };
}

export default async function getProject(request: APIGatewayEvent): Promise<{
  id: string;
  branch: string;
} | null> {
  const subdomain = request.headers.host?.split(".")[0];
  const [_0, project, _1, branch] =
    subdomain?.match(/^([a-z]+-[a-z]+)((?:-)(.*))?$/) ?? [];

  const { Items: items } = await dynamoDB.executeStatement({
    Statement: "SELECT id, default_branch FROM projects WHERE id = ?",
    Parameters: [{ S: project }],
  });
  const fromDB = items?.[0];
  if (!fromDB) return null;

  return {
    id: project,
    branch: branch ?? fromDB.default_branch?.S ?? "main",
  };
}

async function invokeBackend(
  event: APIGatewayEvent,
  project: { id: string; branch: string }
): Promise<APIGatewayResponse> {
  const lambdaName = `backend-${project.id}-${project.branch}`;
  console.info("Inovking backend lambda %s", lambdaName);

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
        FunctionName: lambdaName,
        InvocationType: "RequestResponse",
        Payload: toRequestPayload(event),
      },
      { abortSignal: controller.signal }
    );
    if (statusCode === 200 && payload) return fromResponsePayload(payload);
    if (controller.signal.aborted) return status("Gateway timeout", 504);
    return FunctionError
      ? status(FunctionError, 500)
      : status("Bad gateway", 502);
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
  const response = JSON.parse(
    Buffer.from(payload).toString("utf8")
  ) as BackendLambdaResponse;
  return {
    body: response.body,
    headers: response.headers,
    isBase64Encoded: true,
    statusCode: response.statusCode ?? 200,
  };
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

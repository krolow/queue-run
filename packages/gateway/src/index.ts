import { AbortController } from "@aws-sdk/abort-controller";
import { DynamoDB } from "@aws-sdk/client-dynamodb";
import { Lambda } from "@aws-sdk/client-lambda";
import ms from "ms";
import { URL } from "url";
import { debuglog } from "util";
import type {
  APIGatewayEvent,
  APIGatewayResponse,
  BackendLambdaRequest,
  BackendLambdaResponse,
} from "./types";

const requestTimeout = ms("10s");

const lambda = new Lambda({});
const dynamoDB = new DynamoDB({});
const debug = debuglog("queue-run:gateway");

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
    this.message = message;
    this.statusCode = statusCode;
  }
}

export default async function getProject(request: APIGatewayEvent): Promise<{
  id: string;
  branch: string;
}> {
  const subdomain = request.headers.host?.split(".")[0] ?? "";
  const [, project, , branch] =
    subdomain.match(/^([a-z]+-[a-z]+)((?:-)(.*))?$/) ?? [];
  if (project) {
    debug('Request for project "%s" branch "%s"', project, branch ?? "n/a");
  } else {
    debug("No project/branch match in sub-domain", subdomain);
    throw new StatusCodeError("Not found", 404);
  }

  const { Items: items } = await dynamoDB.executeStatement({
    Statement: "SELECT id, default_branch FROM projects WHERE id = ?",
    Parameters: [{ S: project }],
  });
  const fromDB = items?.[0];
  if (!fromDB) {
    debug('No project "%s" in database', project);
    throw new StatusCodeError("Not found", 404);
  }

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
  debug('Invoking backend lambda "%s"', aliasName);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeout);

  try {
    const result = await lambda.invoke(
      {
        FunctionName: aliasName,
        InvocationType: "RequestResponse",
        LogType: debug.enabled ? "Tail" : "None",
        Payload: toRequestPayload(event),
      },
      { abortSignal: controller.signal }
    );

    debug(
      'Status code: %s version: %s aborted: %s error: "%s"',
      result.StatusCode,
      result.ExecutedVersion,
      controller.signal.aborted,
      result.FunctionError ?? "none"
    );
    if (result.LogResult)
      debug(
        "\n%s",
        Buffer.from(result.LogResult, "base64")
          .toString("utf8")
          .split("\n")
          .map((line) => `>>  ${line}`)
          .join("\n")
      );

    if (result.StatusCode === 200 && result.Payload)
      return fromResponsePayload(result.Payload);
    if (controller.signal.aborted)
      throw new StatusCodeError("Gateway timeout", 504);
    if (result.FunctionError)
      throw new StatusCodeError(result.FunctionError, 500);
    throw new StatusCodeError("Internal server error", 500);
  } catch (error) {
    debug('Invocation error "%s"', error);
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

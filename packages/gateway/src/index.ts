import { AbortController, AbortSignal } from "@aws-sdk/abort-controller";
import { DynamoDB } from "@aws-sdk/client-dynamodb";
import { InvokeCommandOutput, Lambda } from "@aws-sdk/client-lambda";
import ms from "ms";
import invariant from "tiny-invariant";
import { URL } from "url";
import type {
  APIGatewayEvent,
  APIGatewayResponse,
  BackendLambdaRequest,
  LambdaEdgeRequest,
  LambdaEdgeResponse,
} from "./types";
export type { BackendLambdaRequest, BackendLambdaResponse } from "./types";

const debug = true;
const requestTimeout = ms("30s");

const lambda = new Lambda({ region: "us-east-1" });
const dynamoDB = new DynamoDB({ region: "us-east-1" });

const qrPrefix = "qr-";

export async function handler(
  event: APIGatewayEvent | LambdaEdgeRequest
): Promise<APIGatewayResponse | LambdaEdgeResponse> {
  try {
    const request = toRequest(event);
    const { project, branch, lambdaARN } = await findBackend(request);
    if (request.method === "GET" && new URL(request.url).pathname === "/")
      return toResponse(event, redirectToDashboard({ project, branch }));
    else return toResponse(event, await invokeBackend(request, lambdaARN));
  } catch (error) {
    if (error instanceof StatusCodeError) {
      return toResponse(event, {
        body: error.message,
        statusCode: error.statusCode,
      });
    } else {
      console.error("Gateway error", error);
      return toResponse(event, {
        body: "Bad gateway",
        statusCode: 502,
      });
    }
  }
}

function toRequest(
  event: APIGatewayEvent | LambdaEdgeRequest
): BackendLambdaRequest {
  if ("Records" in event) {
    // CloudFront Lambda@Edge request
    const request = event.Records[0].cf.request;
    const headers = Object.fromEntries(
      Object.entries(request.headers).map(([key, values]) => [
        key,
        values.map(({ value }) => value).join(","),
      ])
    );
    return {
      body: request.body?.data,
      headers,
      method: request.method,
      url: `https://${headers.host}${request.uri}`,
    };
  } else {
    // API Gateway v2 request (aka "HTTP API")
    const body = event.isBase64Encoded
      ? event.body
      : event.body
      ? Buffer.from(event.body).toString("base64")
      : undefined;

    return {
      body,
      headers: event.headers,
      method: event.requestContext.http.method,
      requestId: event.requestContext.requestId,
      url: new URL(
        event.requestContext.http.path,
        `https://${event.headers.host}`
      ).href,
    };
  }
}

function toResponse(
  event: APIGatewayEvent | LambdaEdgeRequest,
  response: {
    body?: string | Buffer;
    headers?: { [key: string]: string };
    statusCode: number;
  }
): APIGatewayResponse | LambdaEdgeResponse {
  const isBase64Encoded = Buffer.isBuffer(response.body);
  const body =
    response.body && isBase64Encoded
      ? response.body.toString("base64")
      : response.body;

  if ("Records" in event) {
    // Send CloutFront Lambda@Edge response
    const headers = Object.fromEntries(
      Object.entries(response.headers ?? {}).map(([key, value]) => [
        key,
        [{ value }],
      ])
    );
    return {
      body: body ?? "",
      bodyEncoding: isBase64Encoded ? "base64" : "text",
      headers,
      status: response.statusCode.toString(),
    } as LambdaEdgeResponse;
  } else {
    // Send API Gateway v2 response
    return {
      body,
      headers: response.headers ?? {},
      isBase64Encoded,
      statusCode: response.statusCode,
    } as APIGatewayResponse;
  }
}

// Throw this error to terminate request processing, and respond with specific
// status code.
class StatusCodeError extends Error {
  constructor(public message: string, public statusCode: number) {
    super(`Status code ${statusCode}`);
    this.message = message;
    this.statusCode = statusCode;
  }
}

// Parse project ID and branch from request URL
export default async function findBackend(
  request: BackendLambdaRequest
): Promise<{
  branch?: string | null;
  lambdaARN: string;
  project: string;
}> {
  const hostname = request.headers.host;
  const { Items: backends } = await dynamoDB.executeStatement({
    Statement: `SELECT * FROM "${qrPrefix}backends" WHERE hostname = ?`,
    Parameters: [{ S: hostname }],
  });
  const backend = backends?.[0];
  if (!backend) throw new StatusCodeError("Not found", 404);

  dynamoDB
    .executeStatement({
      Statement: `UPDATE "${qrPrefix}backends" SET last_accessed_at = ? WHERE hostname = ? AND (NOT attribute_exists(last_accessed_at) OR last_accessed_at < ?)`,
      Parameters: [
        { N: String(Date.now()) },
        { S: hostname },
        { N: String(Date.now() - 1000) },
      ],
    })
    .catch(console.error);

  const lambdaARN = backend.lambda_arn.S;
  invariant(lambdaARN);
  const project = backend.project.S;
  invariant(project);
  const branch = backend.branch?.S;
  return { lambdaARN, project, branch };
}

async function invokeBackend(
  request: BackendLambdaRequest,
  lambdaARN: string
): Promise<{
  body?: Buffer;
  headers: { [key: string]: string };
  statusCode: number;
}> {
  return await withTimeout(async (signal) => {
    try {
      const result = await logInvocation(lambdaARN, signal, () =>
        lambda.invoke(
          {
            FunctionName: lambdaARN,
            InvocationType: "RequestResponse",
            LogType: debug ? "Tail" : "None",
            Payload: Buffer.from(JSON.stringify(request)),
          },
          { abortSignal: signal }
        )
      );

      if (result.StatusCode === 200) return parsePayload(result);
      if (signal.aborted) throw new StatusCodeError("Gateway timeout", 504);
      if (result.FunctionError)
        throw new StatusCodeError(result.FunctionError, 500);
      throw new StatusCodeError("Internal server error", 500);
    } catch (error) {
      debug && console.debug('Invocation error "%s"', error);
      if (error instanceof Error && error.name === "ResourceNotFoundException")
        throw new StatusCodeError("Not found", 404);
      else throw error;
    }
  });
}

async function withTimeout<T>(
  // eslint-disable-next-line no-unused-vars
  fn: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeout);
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timeout);
  }
}

async function logInvocation(
  lambdaName: string,
  signal: AbortSignal,
  fn: () => Promise<InvokeCommandOutput>
): Promise<InvokeCommandOutput> {
  debug && console.debug('Invoking backend lambda "%s"', lambdaName);

  const result = await fn();

  debug &&
    console.debug(
      'Lambda invoke: status code: %s version: %s aborted: %s error: "%s"',
      result.StatusCode,
      result.ExecutedVersion,
      signal.aborted,
      result.FunctionError ?? "none"
    );
  debug &&
    result.LogResult &&
    console.debug(
      "\n%s",
      Buffer.from(result.LogResult, "base64")
        .toString("utf8")
        .split("\n")
        .map((line) => `>>  ${line}`)
        .join("\n")
    );
  return result;
}

function parsePayload(result: InvokeCommandOutput): {
  body?: Buffer;
  headers: { [key: string]: string };
  statusCode: number;
} {
  try {
    invariant(result.Payload, "Missing payload");
    const { body, headers, statusCode } = JSON.parse(
      Buffer.from(result.Payload).toString("utf8")
    );
    debug &&
      console.debug(
        'Lambda response: status code: %s body: "%s…"',
        statusCode,
        body.slice(0, 100)
      );
    return {
      body: body ? Buffer.from(body as string, "base64") : undefined,
      headers: headers ?? {},
      statusCode: statusCode ?? 200,
    };
  } catch {
    console.error(
      'Could not parse backend lambda response: "%s"',
      result.Payload
    );
    throw new StatusCodeError("Internal server error", 500);
  }
}

function redirectToDashboard({
  branch,
  project,
}: {
  branch?: string | null;
  project: string;
}): {
  body: string;
  headers: { [key: string]: string };
  statusCode: number;
} {
  const path = branch
    ? `/project/${project}/branch/${branch}`
    : `/project/${project}`;
  const dashboardURL = new URL(path, "https://queue.run").href;
  return {
    body: `See ${dashboardURL}`,
    headers: { Location: dashboardURL },
    statusCode: 303,
  };
}

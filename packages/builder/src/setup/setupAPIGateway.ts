import {
  Api,
  ApiGatewayV2,
  CreateApiRequest,
  CreateIntegrationRequest,
  CreateRouteRequest,
  IntegrationType,
  ProtocolType,
  UpdateIntegrationRequest,
  UpdateRouteRequest,
} from "@aws-sdk/client-apigatewayv2";
import { Lambda } from "@aws-sdk/client-lambda";
import ora from "ora";
import invariant from "tiny-invariant";

const apiGateway = new ApiGatewayV2({});
const lambda = new Lambda({});

// See https://docs.aws.amazon.com/lambda/latest/dg/services-apigateway.html#apigateway-permissions

export async function getAPIGatewayURLs(project: string) {
  const api = await findGatewayAPI({ protocol: ProtocolType.HTTP, project });
  const ws = await findGatewayAPI({
    protocol: ProtocolType.WEBSOCKET,
    project,
  });
  return { http: api?.ApiEndpoint, ws: ws?.ApiEndpoint };
}

// Setup API Gateway. We need the endpoint URLs before we can deploy the project
// for the first time.
export async function setupAPIGateway(project: string): Promise<{
  http: string;
  ws: string;
}> {
  const spinner = ora("Setting up API Gateway...").start();
  const http = await createApi(project, {
    ProtocolType: ProtocolType.HTTP,
  });
  spinner.succeed(`Created API Gateway HTTP endpoint: ${http}`);
  const ws = await createApi(project, {
    ProtocolType: ProtocolType.WEBSOCKET,
    RouteSelectionExpression: "*",
  });
  spinner.succeed(`Created API Gateway WS endpoint: ${ws}`);

  return { http, ws };
}

async function createApi(
  project: string,
  args: Omit<CreateApiRequest, "Name"> & { ProtocolType: ProtocolType }
): Promise<string> {
  const existing = await findGatewayAPI({
    project,
    protocol: args.ProtocolType,
  });
  const options = {
    ...args,
    Description: `QueueRun API gateway for project ${project} (${args.ProtocolType})`,
    Name: `qr-${project}`,
    Tags: { "qr-project": project },
  };

  const api = await (existing
    ? apiGateway.updateApi({ ApiId: existing.ApiId, ...options })
    : apiGateway.createApi(options));
  invariant(api.ApiEndpoint);
  return api.ApiEndpoint;
}

// Once we deployed the Lambda function, setup HTTP and WS integrations.
// API Gateway must have been created before.
export async function setupIntegrations({
  project,
  lambdaARN,
}: {
  project: string;
  lambdaARN: string;
}) {
  const spinner = ora("Updating API Gateway").start();
  await addInvokePermission(lambdaARN);
  await Promise.all([
    setupHTTPIntegrations(project, lambdaARN),
    setupWSIntegrations(project, lambdaARN),
  ]);

  spinner.succeed();
}

async function setupHTTPIntegrations(project: string, lambdaARN: string) {
  const api = await findGatewayAPI({ protocol: ProtocolType.HTTP, project });
  if (!api) throw new Error("Missing API Gateway for HTTP");

  const http = await createIntegration({
    ApiId: api.ApiId,
    IntegrationType: IntegrationType.AWS_PROXY,
    IntegrationUri: lambdaARN,
    PayloadFormatVersion: "2.0",
    TimeoutInMillis: 30000,
  });
  await createRoute({
    ApiId: api.ApiId,
    RouteKey: "ANY /{proxy+}",
    Target: `integrations/${http}`,
  });
  await deployAPI(api, "$default");
}

async function setupWSIntegrations(project: string, lambdaARN: string) {
  const api = await findGatewayAPI({
    protocol: ProtocolType.WEBSOCKET,
    project,
  });
  if (!api) throw new Error("Missing API Gateway for WebSocket");

  const ws = await createIntegration({
    ApiId: api.ApiId,
    ContentHandlingStrategy: "CONVERT_TO_BINARY",
    IntegrationMethod: "POST",
    IntegrationType: IntegrationType.AWS_PROXY,
    IntegrationUri: `arn:aws:apigateway:us-east-1:lambda:path/2015-03-31/functions/${lambdaARN}/invocations`,
    PassthroughBehavior: "WHEN_NO_MATCH",
    TimeoutInMillis: 29000,
  });

  await Promise.all([
    createRoute({
      ApiId: api.ApiId,
      AuthorizationType: "NONE",
      RouteKey: "$connect",
      Target: `integrations/${ws}`,
    }),
    createRoute({
      ApiId: api.ApiId,
      RouteKey: "$disconnect",
      Target: `integrations/${ws}`,
    }),
  ]);

  const defaultRouteId = await createRoute({
    ApiId: api.ApiId,
    RouteKey: "$default",
    RouteResponseSelectionExpression: "$default",
    Target: `integrations/${ws}`,
  });
  await createRouteResponse(api, ws, defaultRouteId);

  // API Gateway insists on WS having a non-empty stage name, and that stage
  // name is used in the URL, so the URL would end with _ws.
  await deployAPI(api, "_ws");
}

async function createIntegration(
  args: CreateIntegrationRequest
): Promise<string> {
  const { Items: items } = await apiGateway.getIntegrations({
    ApiId: args.ApiId,
  });
  const integration = items?.find(
    ({ IntegrationUri }) => IntegrationUri === args.IntegrationUri
  );
  const id = integration?.IntegrationId;
  if (id) {
    await apiGateway.updateIntegration({
      ...(args as UpdateIntegrationRequest),
      IntegrationId: id,
    });
    return id;
  } else {
    const { IntegrationId: id } = await apiGateway.createIntegration(args);
    invariant(id);
    return id;
  }
}

async function createRoute(args: CreateRouteRequest): Promise<string> {
  const { Items: routes } = await apiGateway.getRoutes({ ApiId: args.ApiId });
  const route = routes?.find(({ RouteKey }) => RouteKey === args.RouteKey);
  const id = route?.RouteId;
  if (id) {
    await apiGateway.updateRoute({
      ...(args as UpdateRouteRequest),
      RouteId: id,
    });
    return id;
  } else {
    const { RouteId: id } = await apiGateway.createRoute(args);
    invariant(id);
    return id;
  }
}

async function createRouteResponse(
  api: Api,
  integrationId: string,
  routeId: string
) {
  const { Items: routeResponses } = await apiGateway.getRouteResponses({
    ApiId: api.ApiId,
    RouteId: routeId,
  });
  const hasRouteResponse = routeResponses?.find(
    ({ RouteResponseKey }) => RouteResponseKey === "$default"
  );
  if (!hasRouteResponse) {
    await apiGateway.createRouteResponse({
      ApiId: api.ApiId,
      RouteResponseKey: "$default",
      RouteId: routeId,
    });
  }

  const { Items: integrationResponses } =
    await apiGateway.getIntegrationResponses({
      ApiId: api.ApiId,
      IntegrationId: integrationId,
    });
  const hasIntegrationResponse = integrationResponses?.find(
    ({ IntegrationResponseKey }) => IntegrationResponseKey === "$default"
  );
  if (!hasIntegrationResponse) {
    await apiGateway.createIntegrationResponse({
      ApiId: api.ApiId,
      IntegrationId: integrationId,
      IntegrationResponseKey: "$default",
      ContentHandlingStrategy: "CONVERT_TO_BINARY",
    });
  }
}

async function deployAPI(api: Api, stageName: string): Promise<void> {
  const { DeploymentId, DeploymentStatus } = await apiGateway.createDeployment({
    ApiId: api.ApiId,
  });
  if (DeploymentStatus !== "DEPLOYED")
    throw new Error("Failed to deploy API Gateway");
  invariant(DeploymentId);

  const stage = {
    ApiId: api.ApiId,
    DeploymentId,
    StageName: stageName,
  };

  const { Items: items } = await apiGateway.getStages({ ApiId: api.ApiId });
  const stageExists = items?.find(({ StageName }) => StageName === stageName);
  if (stageExists) await apiGateway.updateStage(stage);
  else await apiGateway.createStage(stage);
}

async function addInvokePermission(lambdaARN: string) {
  const statementId = "qr-api-gateway";
  try {
    await lambda.addPermission({
      Action: "lambda:InvokeFunction",
      FunctionName: lambdaARN,
      Principal: "apigateway.amazonaws.com",
      StatementId: statementId,
    });
  } catch (error) {
    if (!(error instanceof Error && error.name === "ResourceConflictException"))
      throw error;
  }
}

async function findGatewayAPI({
  nextToken,
  project,
  protocol,
}: {
  nextToken?: string;
  project: string;
  protocol: ProtocolType;
}): Promise<Api | null> {
  const result = await apiGateway.getApis({
    ...(nextToken && { NextToken: nextToken }),
  });
  const api = result.Items?.find(
    (api) =>
      api.Tags?.["qr-project"] === project && api.ProtocolType === protocol
  );
  if (api) return api;
  return result.NextToken
    ? await findGatewayAPI({ nextToken: result.NextToken, project, protocol })
    : null;
}

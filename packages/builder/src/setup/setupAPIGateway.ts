import {
  Api,
  ApiGatewayV2,
  CreateApiRequest,
  CreateIntegrationRequest,
  CreateRouteRequest,
  IntegrationType,
  ProtocolType,
} from "@aws-sdk/client-apigatewayv2";
import ora from "ora";
import invariant from "tiny-invariant";

const apiGateway = new ApiGatewayV2({});

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
    RouteSelectionExpression: "@default",
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
  const options: CreateApiRequest = {
    ...args,
    Description: `QueueRun API gateway for project ${project} (${args.ProtocolType})`,
    Name: `qr-${project}`,
    Tags: { "qr-project": project },
  };

  const api = existing
    ? await apiGateway.updateApi({ ApiId: existing.ApiId, ...options })
    : await apiGateway.createApi(options);
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
  const spinner = ora("Setting up API Gateway integrations ...").start();
  await Promise.all([
    setupHTTPIntegrations(project, lambdaARN),
    setupWSIntegrations(project, lambdaARN),
  ]);
  spinner.succeed("Finished with API Gateway integrations");
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
    RouteKey: "$default",
    Target: `integrations/${http}`,
  });
}

async function setupWSIntegrations(project: string, lambdaARN: string) {
  const api = await findGatewayAPI({
    protocol: ProtocolType.WEBSOCKET,
    project,
  });
  if (!api) throw new Error("Missing API Gateway for WebSockets");

  const ws = await createIntegration({
    ApiId: api.ApiId,
    ContentHandlingStrategy: "CONVERT_TO_TEXT",
    IntegrationType: IntegrationType.AWS_PROXY,
    IntegrationUri: `arn:aws:apigateway:us-east-1:lambda:path/2015-03-31/functions/${lambdaARN}/invocations`,
    PassthroughBehavior: "WHEN_NO_MATCH",
    PayloadFormatVersion: "1.0",
    TimeoutInMillis: 29000,
  });
  await Promise.all([
    createRoute({
      ApiId: api.ApiId,
      RouteKey: "$connect",
      Target: `integrations/${ws}`,
    }),
    createRoute({
      ApiId: api.ApiId,
      RouteKey: "$disconnect",
      Target: `integrations/${ws}`,
    }),
    createRoute({
      ApiId: api.ApiId,
      RouteKey: "$default",
      RouteResponseSelectionExpression: "$default",
      Target: `integrations/${ws}`,
    }),
  ]);
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
  if (integration?.IntegrationId) {
    await apiGateway.updateIntegration({
      ...args,
      IntegrationId: integration.IntegrationId,
    });
    return integration.IntegrationId;
  } else {
    const { IntegrationId: id } = await apiGateway.createIntegration(args);
    invariant(id);
    return id;
  }
}

async function createRoute(args: CreateRouteRequest) {
  const { Items: routes } = await apiGateway.getRoutes({ ApiId: args.ApiId });
  const route = routes?.find(({ RouteKey }) => RouteKey === args.RouteKey);
  if (route) await apiGateway.updateRoute({ ...args, RouteId: route.RouteId });
  else await apiGateway.createRoute(args);
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
    NextToken: nextToken,
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

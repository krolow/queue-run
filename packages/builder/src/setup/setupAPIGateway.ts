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
const wsPath = "/_ws";

// See https://docs.aws.amazon.com/lambda/latest/dg/services-apigateway.html#apigateway-permissions

export async function getAPIGatewayURLs(project: string): Promise<{
  httpURL: string;
  wsURL: string;
}> {
  const [http, ws] = await Promise.all([
    findGatewayAPI({ protocol: ProtocolType.HTTP, project }),
    findGatewayAPI({ protocol: ProtocolType.WEBSOCKET, project }),
  ]);
  if (!(http?.ApiEndpoint && ws?.ApiEndpoint))
    throw new Error("API Gateway not configured yet");

  const { Items: domains } = await apiGateway.getDomainNames({});
  for (const { DomainName } of domains ?? []) {
    const { Items } = await apiGateway.getApiMappings({
      DomainName,
    });
    if (Items?.find(({ ApiId }) => ApiId === http.ApiId)) {
      const domain = DomainName!.replace("*.", "");
      return {
        httpURL: `https://${domain}`,
        wsURL: `wss://ws.${domain}${wsPath}`,
      };
    }
  }

  return {
    httpURL: http.ApiEndpoint,
    wsURL: `${ws.ApiEndpoint}${wsPath}`,
  };
}

export async function getAPIGatewayIds(project: string): Promise<{
  httpApiId: string | undefined;
  wsApiId: string | undefined;
}> {
  const [http, ws] = await Promise.all([
    findGatewayAPI({ protocol: ProtocolType.HTTP, project }),
    findGatewayAPI({ protocol: ProtocolType.WEBSOCKET, project }),
  ]);
  return {
    httpApiId: http?.ApiId,
    wsApiId: ws?.ApiId,
  };
}

// Setup API Gateway. We need the endpoint URLs before we can deploy the project
// for the first time.
export async function setupAPIGateway(project: string): Promise<{
  httpURL: string;
  wsURL: string;
  wsApiId: string;
}> {
  const spinner = ora("Setting up API Gateway...").start();
  const [http, ws] = await Promise.all([
    createApi(project, { ProtocolType: ProtocolType.HTTP }),
    createApi(project, {
      ProtocolType: ProtocolType.WEBSOCKET,
      RouteSelectionExpression: "*",
    }),
  ]);

  invariant(http.ApiEndpoint);
  invariant(ws.ApiEndpoint && ws.ApiId);
  spinner.succeed("Created API Gateway endpoints");

  return {
    httpURL: http.ApiEndpoint ?? "unavailable",
    wsURL: `${ws.ApiEndpoint}${wsPath}`,
    wsApiId: ws.ApiId,
  };
}

async function createApi(
  project: string,
  args: Omit<CreateApiRequest, "Name"> & { ProtocolType: ProtocolType }
) {
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
  return api;
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
    createRoute({
      ApiId: api.ApiId,
      RouteKey: "$default",
      Target: `integrations/${ws}`,
    }),
  ]);

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

export async function addAPIGatewayDomain({
  certificateArn,
  domain,
  httpApiId,
  wsApiId,
}: {
  certificateArn: string;
  domain: string;
  httpApiId: string;
  wsApiId: string;
}): Promise<{
  httpURL: string;
  wsURL: string;
}> {
  const spinner = ora(`Creating domain ${domain}`).start();
  await createAndMapDomain({
    apiId: httpApiId,
    certificateArn,
    domain: `*.${domain}`,
    stage: "$default",
  });
  await createAndMapDomain({
    apiId: wsApiId,
    certificateArn,
    domain: `ws.${domain}`,
    stage: "_ws",
  });
  spinner.succeed();
  return { httpURL: `https://${domain}`, wsURL: `wss://ws.${domain}/ws` };
}

async function createAndMapDomain({
  apiId,
  certificateArn,
  domain,
  stage,
}: {
  apiId: string;
  certificateArn: string;
  domain: string;
  stage: string;
}) {
  try {
    await apiGateway.getDomainName({
      DomainName: domain,
    });
  } catch (error) {
    await apiGateway.createDomainName({
      DomainName: domain,
      DomainNameConfigurations: [
        {
          CertificateArn: certificateArn,
          EndpointType: "REGIONAL",
        },
      ],
    });
  }

  const { Items } = await apiGateway
    .getApiMappings({
      DomainName: domain,
    })
    .catch(() => ({ Items: [] }));
  if (!Items?.find((item) => item.ApiId === apiId)) {
    await apiGateway.createApiMapping({
      ApiId: apiId,
      DomainName: domain,
      Stage: stage,
    });
  }
}

export async function removeAPIGatewayDomain({
  domain,
  httpApiId,
  wsApiId,
}: {
  domain: string;
  httpApiId: string;
  wsApiId: string;
}) {
  const spinner = ora(`Removing domain ${domain}`).start();
  await removeDomain({
    apiId: httpApiId,
    domain: `*.${domain}`,
    stage: "$default",
  });
  await removeDomain({
    apiId: wsApiId,
    domain: `ws.${domain}`,
    stage: "_ws",
  });
  spinner.succeed();
}

async function removeDomain({
  apiId,
  domain,
  stage,
}: {
  apiId: string;
  domain: string;
  stage: string;
}) {
  const { Items } = await apiGateway.getApiMappings({
    DomainName: domain,
  });
  const mappingId = Items?.find(
    ({ ApiId, Stage }) => ApiId === apiId && Stage === stage
  )?.ApiMappingId;
  if (mappingId) {
    await apiGateway.deleteApiMapping({
      ApiMappingId: mappingId,
      DomainName: domain,
    });
  }
}

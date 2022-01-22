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

const wsStage = "prod";

// See https://docs.aws.amazon.com/lambda/latest/dg/services-apigateway.html#apigateway-permissions

/**
 * Returns HTTP and WS URLs from API Gateway: custom domain name if available.
 *
 * @param project Project name
 * @returns HTTP and WS URLs
 * @throws If API Gateway not configured yet
 */
export async function getAPIGatewayURLs({
  project,
  region,
}: {
  project: string;
  region: string;
}): Promise<{
  httpUrl: string;
  wsUrl: string;
}> {
  const apiGateway = new ApiGatewayV2({ region });
  const [http, ws] = await Promise.all([
    findGatewayAPI({ apiGateway, protocol: ProtocolType.HTTP, project }),
    findGatewayAPI({ apiGateway, protocol: ProtocolType.WEBSOCKET, project }),
  ]);
  if (!(http?.ApiEndpoint && ws?.ApiEndpoint))
    throw new Error("Project has not been deployed successfully");

  const { Items: domains } = await apiGateway.getDomainNames({});
  for (const { DomainName } of domains ?? []) {
    const { Items } = await apiGateway.getApiMappings({
      DomainName,
    });
    if (Items?.find(({ ApiId }) => ApiId === http.ApiId)) {
      const domain = DomainName!.replace("*.", "");
      return {
        httpUrl: `https://${domain}`,
        wsUrl: `wss://ws.${domain}`,
      };
    }
  }

  return {
    httpUrl: http.ApiEndpoint,
    wsUrl: `${ws.ApiEndpoint}/${wsStage}`,
  };
}

// Setup API Gateway. We need the endpoint URLs before we can deploy the project
// for the first time.
export async function setupAPIGateway({
  project,
  region,
}: {
  project: string;
  region: string;
}): Promise<{
  httpUrl: string;
  wsUrl: string;
  wsApiId: string;
}> {
  const apiGateway = new ApiGatewayV2({ region });
  const [, ws] = await Promise.all([
    createApi(apiGateway, project, { ProtocolType: ProtocolType.HTTP }),
    createApi(apiGateway, project, {
      ProtocolType: ProtocolType.WEBSOCKET,
      RouteSelectionExpression: "*",
    }),
  ]);
  invariant(ws.ApiId);

  const { httpUrl, wsUrl } = await getAPIGatewayURLs({ project, region });
  return { httpUrl, wsUrl, wsApiId: ws.ApiId };
}

async function createApi(
  apiGateway: ApiGatewayV2,
  project: string,
  args: Omit<CreateApiRequest, "Name"> & { ProtocolType: ProtocolType }
) {
  const existing = await findGatewayAPI({
    apiGateway,
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
  lambdaArn,
  region,
}: {
  project: string;
  lambdaArn: string;
  region: string;
}) {
  const apiGateway = new ApiGatewayV2({ region });
  const spinner = ora("Updating API Gateway").start();
  await addInvokePermission({ lambdaArn, region });
  await Promise.all([
    setupHTTPIntegrations(apiGateway, project, lambdaArn),
    setupWSIntegrations(apiGateway, project, lambdaArn),
  ]);

  spinner.succeed();
}

async function setupHTTPIntegrations(
  apiGateway: ApiGatewayV2,
  project: string,
  lambdaArn: string
) {
  const api = await findGatewayAPI({
    apiGateway,
    protocol: ProtocolType.HTTP,
    project,
  });
  if (!api) throw new Error("Missing API Gateway for HTTP");

  const http = await createIntegration(apiGateway, {
    ApiId: api.ApiId,
    IntegrationType: IntegrationType.AWS_PROXY,
    IntegrationUri: lambdaArn,
    PayloadFormatVersion: "2.0",
    TimeoutInMillis: 30000,
  });
  await createRoute(apiGateway, {
    ApiId: api.ApiId,
    RouteKey: "ANY /{proxy+}",
    Target: `integrations/${http}`,
  });
  await deployAPI(apiGateway, api, "$default");
}

async function setupWSIntegrations(
  apiGateway: ApiGatewayV2,
  project: string,
  lambdaArn: string
) {
  const api = await findGatewayAPI({
    apiGateway,
    protocol: ProtocolType.WEBSOCKET,
    project,
  });
  if (!api) throw new Error("Missing API Gateway for WebSocket");

  const ws = await createIntegration(apiGateway, {
    ApiId: api.ApiId,
    ContentHandlingStrategy: "CONVERT_TO_BINARY",
    IntegrationMethod: "POST",
    IntegrationType: IntegrationType.AWS_PROXY,
    IntegrationUri: `arn:aws:apigateway:us-east-1:lambda:path/2015-03-31/functions/${lambdaArn}/invocations`,
    PassthroughBehavior: "WHEN_NO_MATCH",
    TimeoutInMillis: 29000,
  });

  await Promise.all([
    createRoute(apiGateway, {
      ApiId: api.ApiId,
      AuthorizationType: "NONE",
      RouteKey: "$connect",
      Target: `integrations/${ws}`,
    }),
    createRoute(apiGateway, {
      ApiId: api.ApiId,
      RouteKey: "$disconnect",
      Target: `integrations/${ws}`,
    }),
    createRoute(apiGateway, {
      ApiId: api.ApiId,
      RouteKey: "$default",
      Target: `integrations/${ws}`,
    }),
  ]);

  // API Gateway insists on WS having a non-empty stage name, and that stage
  // name is used in the URL, so the URL would end with _ws.
  await deployAPI(apiGateway, api, wsStage);
}

async function createIntegration(
  apiGateway: ApiGatewayV2,
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

async function createRoute(
  apiGateway: ApiGatewayV2,
  args: CreateRouteRequest
): Promise<string> {
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

async function deployAPI(
  apiGateway: ApiGatewayV2,
  api: Api,
  stageName: string
): Promise<void> {
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

async function addInvokePermission({
  lambdaArn,
  region,
}: {
  lambdaArn: string;
  region: string;
}) {
  const statementId = "qr-api-gateway";
  const lambda = new Lambda({ region });
  try {
    await lambda.addPermission({
      Action: "lambda:InvokeFunction",
      FunctionName: lambdaArn,
      Principal: "apigateway.amazonaws.com",
      StatementId: statementId,
    });
  } catch (error) {
    if (!(error instanceof Error && error.name === "ResourceConflictException"))
      throw error;
  }
}

async function findGatewayAPI({
  apiGateway,
  nextToken,
  project,
  protocol,
}: {
  apiGateway: ApiGatewayV2;
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
    ? await findGatewayAPI({
        apiGateway,
        nextToken: result.NextToken,
        project,
        protocol,
      })
    : null;
}

export async function addAPIGatewayDomain({
  certificateArn,
  domain,
  project,
  region,
}: {
  certificateArn: string;
  domain: string;
  project: string;
  region: string;
}): Promise<{
  httpUrl: string;
  wsUrl: string;
}> {
  const apiGateway = new ApiGatewayV2({ region });
  const [http, ws] = await Promise.all([
    findGatewayAPI({ apiGateway, protocol: ProtocolType.HTTP, project }),
    findGatewayAPI({ apiGateway, protocol: ProtocolType.WEBSOCKET, project }),
  ]);

  await Promise.all([
    addDomainMapping({
      apiGateway,
      apiId: http?.ApiId!,
      certificateArn,
      domain: domain,
      stage: "$default",
    }),
    addDomainMapping({
      apiGateway,
      apiId: http?.ApiId!,
      certificateArn,
      domain: `*.${domain}`,
      stage: "$default",
    }),
    await addDomainMapping({
      apiGateway,
      apiId: ws?.ApiId!,
      certificateArn,
      domain: `ws.${domain}`,
      stage: wsStage,
    }),
  ]);
  return {
    httpUrl: `https://${domain}`,
    wsUrl: `wss://ws.${domain}/${wsStage}`,
  };
}

async function addDomainMapping({
  apiGateway,
  apiId,
  certificateArn,
  domain,
  stage,
}: {
  apiGateway: ApiGatewayV2;
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
  project,
  region,
}: {
  domain: string;
  project: string;
  region: string;
}) {
  const apiGateway = new ApiGatewayV2({ region });
  const [http, ws] = await Promise.all([
    findGatewayAPI({ apiGateway, protocol: ProtocolType.HTTP, project }),
    findGatewayAPI({ apiGateway, protocol: ProtocolType.WEBSOCKET, project }),
  ]);
  await Promise.all([
    removeDomainMapping({
      apiGateway,
      apiId: http?.ApiId!,
      domain: `*.${domain}`,
      stage: "$default",
    }),
    removeDomainMapping({
      apiGateway,
      apiId: ws?.ApiId!,
      domain: `ws.${domain}`,
      stage: wsStage,
    }),
  ]);
}

async function removeDomainMapping({
  apiGateway,
  apiId,
  domain,
  stage,
}: {
  apiGateway: ApiGatewayV2;
  apiId: string;
  domain: string;
  stage: string;
}) {
  console.log("remove mapping", domain);
  const { Items } = await apiGateway
    .getApiMappings({
      DomainName: domain,
    })
    .catch(() => ({ Items: [] }));
  const mappingId = Items?.find(
    ({ ApiId, Stage }) => ApiId === apiId && Stage === stage
  )?.ApiMappingId;
  if (mappingId) {
    await apiGateway.deleteApiMapping({
      ApiMappingId: mappingId,
      DomainName: domain,
    });
  }
  await apiGateway.deleteDomainName({ DomainName: domain }).catch(() => null);
}

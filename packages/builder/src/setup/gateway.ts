import {
  Api,
  ApiGatewayV2,
  CreateApiRequest,
  ProtocolType,
} from "@aws-sdk/client-apigatewayv2";
import invariant from "tiny-invariant";

const wsStage = "_ws";
const httpStage = "$default";

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
  httpApiId: string;
  httpUrl: string;
  wsApiId: string;
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
        httpApiId: http.ApiId!,
        httpUrl: `https://${domain}`,
        wsApiId: ws.ApiId!,
        wsUrl: `wss://ws.${domain}`,
      };
    }
  }

  return {
    httpApiId: http.ApiId!,
    httpUrl: http.ApiEndpoint,
    wsApiId: ws.ApiId!,
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
  httpApiId: string;
  httpUrl: string;
  websocketUrl: string;
  websocketApiId: string;
}> {
  const apiGateway = new ApiGatewayV2({ region });
  const [http, websocket] = await Promise.all([
    createApi(apiGateway, project, ProtocolType.HTTP),
    createApi(apiGateway, project, ProtocolType.WEBSOCKET, {
      RouteSelectionExpression: "*",
    }),
  ]);
  invariant(http.ApiId);
  invariant(websocket.ApiId);

  const { httpUrl, wsUrl } = await getAPIGatewayURLs({ project, region });
  return {
    httpApiId: http.ApiId,
    httpUrl,
    websocketUrl: wsUrl,
    websocketApiId: websocket.ApiId,
  };
}

async function createApi(
  apiGateway: ApiGatewayV2,
  project: string,
  protocol: ProtocolType,
  options?: Omit<CreateApiRequest, "Name" | "ProtocolType">
) {
  const existing = await findGatewayAPI({ apiGateway, project, protocol });
  const args = {
    ProtocolType: protocol,
    Description: `QueueRun API gateway for project ${project} (${protocol})`,
    Name: `qr-${protocol.toLowerCase()}-${project}`,
    ApiId: existing?.ApiId,
    ...options,
  };

  const api = await (existing
    ? apiGateway.updateApi(args)
    : apiGateway.createApi(args));
  invariant(api.ApiEndpoint);
  return api;
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
  const name = `qr-${protocol.toLowerCase()}-${project}`;
  const api = result.Items?.find((api) => api.Name === name);
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
    addDomainMapping({
      apiGateway,
      apiId: ws?.ApiId!,
      certificateArn,
      domain: `ws.${domain}`,
      stage: wsStage,
    }),
  ]);
  return {
    httpUrl: `https://${domain}`,
    wsUrl: `wss://ws.${domain}`,
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
    http &&
      removeDomainMapping({
        apiGateway,
        apiId: http.ApiId!,
        domain: `*.${domain}`,
        stage: httpStage,
      }),
    http &&
      removeDomainMapping({
        apiGateway,
        apiId: http.ApiId!,
        domain,
        stage: httpStage,
      }),
    ws &&
      removeDomainMapping({
        apiGateway,
        apiId: ws.ApiId!,
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

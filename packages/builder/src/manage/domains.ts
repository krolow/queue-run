import { ApiGatewayV2, ProtocolType } from "@aws-sdk/client-apigatewayv2";
import { httpStage, wsStage } from "../constants.js";
import { findGatewayAPI } from "../deploy/gateway.js";

export async function addCustomDomain({
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

export async function removeCustomDomain({
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

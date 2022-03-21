import { ApiGatewayV2, ProtocolType } from "@aws-sdk/client-apigatewayv2";
import { httpStage, wsStage } from "../constants.js";
import { findGatewayAPI } from "../deploy/gateway.js";

export async function addCustomDomain({
  certificateArn,
  domainName,
  project,
  region,
}: {
  certificateArn: string;
  domainName: string;
  project: string;
  region: string;
}): Promise<{
  httpUrl: string;
  wsUrl: string;
}> {
  const apiGateway = new ApiGatewayV2({ region });
  const [http, websocket] = await Promise.all([
    findGatewayAPI({ apiGateway, protocol: ProtocolType.HTTP, project }),
    findGatewayAPI({ apiGateway, protocol: ProtocolType.WEBSOCKET, project }),
  ]);
  if (!(http && websocket)) throw new Error("Did you deploy the project?");

  await Promise.all([
    addDomainMapping({
      apiGateway,
      apiId: http?.ApiId!,
      certificateArn,
      domainName,
      stage: "$default",
    }),
    addDomainMapping({
      apiGateway,
      apiId: http?.ApiId!,
      certificateArn,
      domainName: `*.${domainName}`,
      stage: "$default",
    }),
    addDomainMapping({
      apiGateway,
      apiId: websocket?.ApiId!,
      certificateArn,
      domainName: `ws.${domainName}`,
      stage: wsStage,
    }),
  ]);
  return {
    httpUrl: `https://${domainName}`,
    wsUrl: `wss://ws.${domainName}`,
  };
}

async function addDomainMapping({
  apiGateway,
  apiId,
  certificateArn,
  domainName,
  stage,
}: {
  apiGateway: ApiGatewayV2;
  apiId: string;
  certificateArn: string;
  domainName: string;
  stage: string;
}) {
  try {
    await apiGateway.getDomainName({
      DomainName: domainName,
    });
  } catch (error) {
    await apiGateway.createDomainName({
      DomainName: domainName,
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
      DomainName: domainName,
    })
    .catch(() => ({ Items: [] }));
  if (!Items?.find((item) => item.ApiId === apiId)) {
    await apiGateway.createApiMapping({
      ApiId: apiId,
      DomainName: domainName,
      Stage: stage,
    });
  }
}

export async function removeCustomDomain({
  domainName,
  project,
  region,
}: {
  domainName: string;
  project: string;
  region: string;
}) {
  const apiGateway = new ApiGatewayV2({ region });
  try {
    await apiGateway.getDomainName({
      DomainName: domainName,
    });
  } catch (error) {
    if ((error as { name: string }).name === "NotFoundException") return;
    else throw error;
  }

  const [http, websocket] = await Promise.all([
    findGatewayAPI({ apiGateway, protocol: ProtocolType.HTTP, project }),
    findGatewayAPI({ apiGateway, protocol: ProtocolType.WEBSOCKET, project }),
  ]);

  await removeDomain({
    apiGateway,
    domainName,
    httpApiId: http?.ApiId,
    websocketApiId: websocket?.ApiId,
  });
}

export async function removeCustomDomains({
  project,
  region,
}: {
  project: string;
  region: string;
}) {
  const apiGateway = new ApiGatewayV2({ region });
  const [http, websocket] = await Promise.all([
    findGatewayAPI({ apiGateway, protocol: ProtocolType.HTTP, project }),
    findGatewayAPI({ apiGateway, protocol: ProtocolType.WEBSOCKET, project }),
  ]);
  const domainNames = await listDomainNames(apiGateway);

  await Promise.all(
    domainNames.map((domainName) =>
      removeDomain({
        apiGateway,
        domainName,
        httpApiId: http?.ApiId,
        websocketApiId: websocket?.ApiId,
      })
    )
  );
}

async function listDomainNames(
  apiGateway: ApiGatewayV2,
  nextToken?: string
): Promise<string[]> {
  const { Items, NextToken } = await apiGateway.getDomainNames({
    ...(nextToken && { NextToken: nextToken }),
  });
  const domainNames = Items?.map(({ DomainName }) => DomainName!) ?? [];
  return NextToken
    ? [...domainNames, ...(await listDomainNames(apiGateway, NextToken))]
    : domainNames;
}

async function removeDomain({
  apiGateway,
  domainName,
  httpApiId,
  websocketApiId,
}: {
  apiGateway: ApiGatewayV2;
  domainName: string;
  httpApiId: string | undefined;
  websocketApiId: string | undefined;
}) {
  const { Items } = await apiGateway.getApiMappings({ DomainName: domainName });
  if (!Items?.length) return;

  const mappings =
    Items?.filter(
      (item) =>
        (item.ApiId === httpApiId && item.Stage === httpStage) ||
        (item.ApiId === websocketApiId && item.Stage === wsStage)
    ) ?? [];
  await Promise.all(
    mappings.map(({ ApiMappingId }) =>
      apiGateway.deleteApiMapping({ ApiMappingId, DomainName: domainName })
    )
  );

  // If we started with some API mapping, and end with no API mapping,
  // then only we're using the domain, so we can delete it
  const canDelete = !(await (
    await apiGateway.getApiMappings({ DomainName: domainName })
  ).Items?.length);
  if (canDelete)
    await apiGateway
      .deleteDomainName({ DomainName: domainName })
      .catch(() => {});
}

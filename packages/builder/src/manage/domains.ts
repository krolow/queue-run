import { ApiGatewayV2, ProtocolType } from "@aws-sdk/client-apigatewayv2";
import cloudform, { ApiGatewayV2 as APGWV2, Fn } from "cloudform";
import { filter } from "modern-async";
import { createHash } from "node:crypto";
import { httpStage, wsStage } from "../constants.js";
import { findGatewayAPI } from "../deploy/gateway.js";
import { deleteStack, deployStack, findStack } from "../deploy/stack.js";

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

  await deployStack({
    stack: {
      StackName: getStackName(project, domainName),
      // @ts-ignore
      TemplateBody: cloudform.default({
        AWSTemplateFormatVersion: "2010-09-09",
        Description: `QueueRun domain ${domainName} for ${project}`,
        Resources: {
          httpDomain: new APGWV2.DomainName({
            DomainName: domainName,
            DomainNameConfigurations: [
              { CertificateArn: certificateArn, EndpointType: "REGIONAL" },
            ],
          }),
          httpApiMapping: new APGWV2.ApiMapping({
            ApiId: http.ApiId!,
            DomainName: Fn.Ref("httpDomain"),
            Stage: httpStage,
          }).dependsOn("httpDomain"),
          websocketDomain: new APGWV2.DomainName({
            DomainName: `ws.${domainName}`,
            DomainNameConfigurations: [
              { CertificateArn: certificateArn, EndpointType: "REGIONAL" },
            ],
          }),
          websocketApiMapping: new APGWV2.ApiMapping({
            ApiId: websocket.ApiId!,
            DomainName: Fn.Ref("websocketDomain"),
            Stage: wsStage,
          }).dependsOn("websocketDomain"),
        },
      }),
    },
  });

  return {
    httpUrl: `https://${domainName}`,
    wsUrl: `wss://ws.${domainName}`,
  };
}

function getStackName(project: string, domainName: string) {
  const hash = createHash("SHA1").update(domainName).digest("hex").slice(0, 6);
  const masked = domainName.replace(/[^a-zA-Z0-9]+/g, "-");
  return `qr-${project}-${masked}-${hash}`;
}

export async function removeCustomDomain({
  domainName,
  project,
}: {
  domainName: string;
  project: string;
}) {
  await deleteStack(getStackName(project, domainName));
}

export async function removeCustomDomains({
  project,
  region,
}: {
  project: string;
  region: string;
}) {
  const apiGateway = new ApiGatewayV2({ region });
  const httpApi = await findGatewayAPI({
    apiGateway,
    project,
    protocol: ProtocolType.HTTP,
  });
  if (!httpApi) return;

  const domainNames = await listDomainNames(apiGateway, httpApi.ApiId!);
  for (const domainName of domainNames) {
    const stackName = getStackName(project, domainName);
    if (await findStack(stackName)) await deleteStack(stackName);
  }
}

export async function listDomainNames(
  apiGateway: ApiGatewayV2,
  apiId: string,
  nextToken?: string
): Promise<string[]> {
  const { Items, NextToken } = await apiGateway.getDomainNames({
    ...(nextToken && { NextToken: nextToken }),
  });
  const domainNames = await filter(
    Items!.map(({ DomainName }) => DomainName!),
    async (DomainName) => {
      const { Items } = await apiGateway.getApiMappings({
        DomainName,
      });
      return Items!.some(({ ApiId }) => ApiId === apiId);
    }
  );
  return NextToken
    ? [...domainNames, ...(await listDomainNames(apiGateway, NextToken))]
    : domainNames;
}

import { Lambda } from "@aws-sdk/client-lambda";
import { currentVersionAlias } from "../constants.js";

export async function getRecentVersions({
  region,
  slug,
}: {
  region: string;
  slug: string;
}): Promise<
  Array<{
    arn: string;
    isCurrent: boolean;
    modified: Date;
    size: number;
    version: string;
  }>
> {
  const lambdaName = `qr-${slug}`;
  const lambda = new Lambda({ region });

  const { FunctionVersion: currentVersion } = await lambda.getAlias({
    FunctionName: lambdaName,
    Name: currentVersionAlias,
  });
  const versions = (await getAllVersions(lambdaName))
    .filter(({ version }) => version !== "$LATEST")
    .sort((a, b) => +b.version - +a.version);

  return versions.map((version) => ({
    ...version,
    isCurrent: version.version === currentVersion,
  }));
}

async function getAllVersions(
  lambdaName: string,
  nextToken?: string
): Promise<
  Array<{
    arn: string;
    modified: Date;
    size: number;
    version: string;
  }>
> {
  const lambda = new Lambda({});
  const { NextMarker, Versions } = await lambda.listVersionsByFunction({
    FunctionName: lambdaName,
    ...(nextToken && { Marker: nextToken }),
  });
  if (!Versions) return [];
  const versions = Versions.map((version) => ({
    arn: version.FunctionArn!,
    modified: new Date(version.LastModified!),
    size: version.CodeSize!,
    version: version.Version!,
  }));
  return NextMarker
    ? [...versions, ...(await getAllVersions(lambdaName, NextMarker))]
    : versions;
}

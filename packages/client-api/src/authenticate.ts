import { DynamoDB } from "@aws-sdk/client-dynamodb";
import { createHash } from "crypto";
import { Request, Response } from "node-fetch";

const dynamoDB = new DynamoDB({});

export default async function authenticate(request: Request): Promise<{
  projectId: string;
  branch: string;
}> {
  const tokenId = await getAccessTokenId(request);
  const projectId = await getProjectIdFromToken(tokenId);
  const { defaultBranch } = await getProject(projectId);
  const subdomain = getSubdomain(request);

  if (subdomain === projectId) return { projectId, branch: defaultBranch };
  if (subdomain.startsWith(`${projectId}-`)) {
    const branch = subdomain.substring(projectId.length + 1);
    if (/^[a-zA-Z0-9-_]+$/.test(branch)) return { projectId, branch };
  }
  throw new Response("Project not found", { status: 404 });
}

async function getAccessTokenId(request: Request): Promise<string> {
  const authorization = request.headers.get("authorization");
  if (!authorization)
    throw new Response("Missing Authorization header", { status: 401 });
  const bearerToken = authorization.match(/^Bearer (.+)$/)?.[1];
  if (!bearerToken)
    throw new Response("Missing authorization Bearer token", {
      status: 401,
    });
  return createHash("sha256").update(bearerToken).digest("hex");
}

async function getProjectIdFromToken(tokenId: string): Promise<string> {
  const { Attributes: attributes } = await dynamoDB.updateItem({
    TableName: "client_tokens",
    Key: { id: { S: tokenId } },
    UpdateExpression: "SET last_accessed_at = :timestamp",
    ExpressionAttributeValues: {
      ":timestamp": { N: String(Date.now()) },
    },
    ConditionExpression:
      "last_accessed_at < :timestamp OR NOT(attribute_exists(last_accessed_at))",
  });
  const projectId = attributes?.project_id.S;
  if (!projectId) throw new Response("Invalid bearer token", { status: 403 });
  return projectId;
}

async function getProject(projectId: string): Promise<{
  projectId: string;
  defaultBranch: string;
}> {
  const { Items: items } = await dynamoDB.executeStatement({
    Statement: "SELECT * FROM projects WHERE id = ?",
    Parameters: [{ S: projectId }],
  });
  const project = items?.[0];
  if (!project) throw new Response("Project not found", { status: 404 });
  return {
    projectId,
    defaultBranch: project.default_branch.S ?? "main",
  };
}

function getSubdomain(request: Request): string {
  const subdomain = request.headers.get("host")?.split(".")[0];
  if (!subdomain) throw new Response("Missing subdomain", { status: 400 });
  return subdomain;
}

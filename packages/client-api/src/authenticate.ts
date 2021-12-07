import { DynamoDB } from "@aws-sdk/client-dynamodb";
import { createHash } from "crypto";
import { Request, Response } from "node-fetch";
import invariant from "tiny-invariant";

const dynamoDB = new DynamoDB({});

type Project = {
  projectId: string;
  defaultBranch: string;
};

export default async function authenticate(request: Request): Promise<{
  projectId: string;
  branch: string;
}> {
  const token = await getAccessToken(request);

  const { Items: items } = await dynamoDB.executeStatement({
    Statement:
      "UPDATE client_tokens SET last_accessed_at = ? WHERE token = ? RETURNING ALL NEW *",
    Parameters: [{ N: Date.now().toString() }, { S: token }],
  });
  const clientToken = items?.[0];
  if (!clientToken) throw new Response("Invalid bearer token", { status: 403 });

  invariant(clientToken.project_id.S, "Client token missing project_id");
  const { defaultBranch, projectId } = await getProject(
    clientToken.project_id.S
  );

  const subdomain = request.headers.get("host")?.split(".")[0];
  if (!subdomain) throw new Response("Missing subdomain", { status: 400 });

  if (subdomain === projectId) return { projectId, branch: defaultBranch };
  if (subdomain.startsWith(`${projectId}-`)) {
    const branch = subdomain.substring(projectId.length + 1);
    if (/^[a-zA-Z0-9-_]+$/.test(branch)) return { projectId, branch };
  }
  throw new Response("Project not found", { status: 404 });
}

async function getAccessToken(request: Request): Promise<string> {
  const authorization = request.headers.get("authorization");
  if (!authorization)
    throw new Response("Missing Authorization header", { status: 401 });
  const token = authorization.match(/^Bearer (.+)$/)?.[1];
  if (!token)
    throw new Response("Missing authorization Bearer token", {
      status: 401,
    });
  return createHash("sha256").update(token).digest("hex");
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

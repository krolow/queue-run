import { DynamoDB, ExecuteStatementOutput } from "@aws-sdk/client-dynamodb";
import crypto from "crypto";
import dotenv from "dotenv";
import invariant from "tiny-invariant";

invariant(process.env.CREDENTIALS, "CREDENTIALS env var is required");
const credentials = dotenv.parse<{
  aws_access_key_id: string;
  aws_secret_access_key: string;
  aws_region: string;
}>(process.env.CREDENTIALS);

const dynamoDB = new DynamoDB({
  credentials: {
    accessKeyId: credentials.aws_access_key_id,
    secretAccessKey: credentials.aws_secret_access_key,
  },
  region: credentials.aws_region,
  logger: console,
});
export default dynamoDB;

export declare type Project = {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  defaultBranch: string;
};

export declare type Deploy = {
  branch: string;
  createdAt: Date;
  id: string;
  status: string;
  updatedAt: Date;
};

export declare type ClientToken = {
  createdAt: Date;
  token: string;
  lastAccessAt: Date | null;
  name: string;
  projectId: string;
  // This is only available when creating a new token, and not stores in database
  clientToken?: string;
};

export async function getProjects(): Promise<Project[]> {
  const { Items: items } = await dynamoDB.executeStatement({
    Statement: "SELECT * FROM projects WHERE account_id = ?",
    Parameters: [{ S: "122210178198" }],
  });
  if (!items) throw new Response("No projects found", { status: 403 });
  return items.map(toProject);
}

export async function getProject({ id }: { id: string }) {
  const { Items: items } = await dynamoDB.executeStatement({
    Statement: "SELECT * FROM projects WHERE account_id = ? AND id = ?",
    Parameters: [{ S: "122210178198" }, { S: id }],
  });
  const item = items?.[0];
  if (!item) throw new Response("No projects found", { status: 404 });
  return toProject(item);
}

function toProject(
  item: NonNullable<ExecuteStatementOutput["Items"]>[0]
): Project {
  return {
    id: item.id.S!,
    createdAt: new Date(+item.created_at.N!),
    defaultBranch: item.default_branch?.S ?? "main",
    updatedAt: new Date(+item.updated_at.N!),
  };
}

export async function getDeploys({
  projectId,
}: {
  projectId: string;
}): Promise<Deploy[]> {
  const { Items: items } = await dynamoDB.executeStatement({
    Statement: "SELECT * FROM deploys WHERE project_id = ?",
    Parameters: [{ S: projectId }],
  });
  if (!items) throw new Response("No deploys found", { status: 403 });
  return items.map(toDeploy);
}

function toDeploy(
  item: NonNullable<ExecuteStatementOutput["Items"]>[0]
): Deploy {
  return {
    branch: item.branch.S!,
    createdAt: new Date(+item.created_at.N!),
    id: item.id.S!,
    status: item.status.S!,
    updatedAt: new Date(+item.updated_at.N!),
  };
}

export async function getClientTokens({
  projectId,
}: {
  projectId: string;
}): Promise<ClientToken[]> {
  const { Items: items } = await dynamoDB.executeStatement({
    Statement: "SELECT * FROM client_tokens WHERE project_id = ?",
    Parameters: [{ S: projectId }],
  });
  return (
    items?.map((item) => ({
      createdAt: new Date(+item.created_at.N!),
      lastAccessAt: item.last_access_at?.N
        ? new Date(+item.last_access_at.N!)
        : null,
      name: item.name.S!,
      projectId: item.sproject_id.S!,
      token: item.token.S!,
    })) ?? []
  );
}

export async function createClientToken({
  name,
  projectId,
}: {
  name: string;
  projectId: string;
}): Promise<ClientToken> {
  const clientToken = crypto.pseudoRandomBytes(64).toString("base64");
  const token = crypto.createHash("sha256").update(clientToken).digest("hex");
  const createdAt = new Date();

  try {
    await dynamoDB.putItem({
      TableName: "client_tokens",
      Item: {
        token: { S: token },
        created_at: { N: createdAt.getTime().toString() },
        name: { S: name },
        project_id: { S: projectId },
      },
    });
  } catch (e) {
    console.error(e);
    throw new Response("Failed to create token", { status: 500 });
  }

  return { clientToken, createdAt, lastAccessAt: null, name, projectId, token };
}

export async function deleteClientToken({ tokenId }: { tokenId: string }) {
  await dynamoDB.deleteItem({
    TableName: "client_tokens",
    Key: { token: { S: tokenId } },
  });
}

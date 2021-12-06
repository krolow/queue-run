import { DynamoDB, ExecuteStatementOutput } from "@aws-sdk/client-dynamodb";

const [accessKeyId, secretAccessKey] = process.env.AWS_MAIN!.split(":");
const dynamoDB = new DynamoDB({
  credentials: { accessKeyId, secretAccessKey },
  region: process.env.AWS_REGION,
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

export async function getProjects(): Promise<Project[]> {
  const { Items: items } = await dynamoDB.executeStatement({
    Statement: `SELECT *
      FROM projects WHERE account_id = ?`,
    Parameters: [{ S: "122210178198" }],
  });
  if (!items) throw new Response("No projects found", { status: 403 });
  return items.map(toProject);
}

export async function getProject({ id }: { id: string }) {
  const { Items: items } = await dynamoDB.executeStatement({
    Statement: `SELECT *
      FROM projects WHERE account_id = ? AND id = ?`,
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
    defaultBranch: item.default_branch.S ?? "main",
    updatedAt: new Date(+item.updated_at.N!),
  };
}

export async function getDeploys({
  projectId,
}: {
  projectId: string;
}): Promise<Deploy[]> {
  const { Items: items } = await dynamoDB.executeStatement({
    Statement: `SELECT * FROM deploys WHERE project_id = ?`,
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

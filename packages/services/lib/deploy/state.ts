import { DynamoDB } from "@aws-sdk/client-dynamodb";
import { deleteS3Archive } from "./storage";

export declare type Deploy = {
  branchId?: string;
  // Timestamp when deploy was completed with any outcome (including if cancelled)
  completedAt?: Date;
  // Duration deploy was allowed to run, or if currently running
  duration?: number;
  id: string;
  outcome?: DeployOutcome;
  projectId: string;
  queuedAt: Date;
  startedAt?: Date;
};

declare type DeployOutcome = "success" | "failed" | "cancelled";

const dynamoDB = new DynamoDB({});

export async function getDeploy(deployId: string): Promise<Deploy | null> {
  const { Items: items } = await dynamoDB.executeStatement({
    Statement: "SELECT * FROM deploys WHERE id = ?",
    Parameters: [{ S: deployId }],
  });
  const item = items[0];
  if (!item) return null;

  const startedAt = item.started_at?.N ? +item.started_at.N : null;
  const completedAt = item.completed_at?.N ? +item.completed_at.N : null;
  const duration =
    completedAt && startedAt
      ? completedAt - startedAt
      : startedAt
      ? Date.now() - startedAt
      : null;

  return {
    branchId: item.branch_id?.S,
    completedAt: completedAt ? new Date(completedAt) : undefined,
    duration,
    id: item.id.S,
    outcome: item.outcome?.S as "success" | "failed" | "cancelled",
    projectId: item.project_id.S,
    queuedAt: new Date(Number(item.created_at.N)),
    startedAt: startedAt ? new Date(startedAt) : undefined,
  };
}

// User makes one deploy, then a second, which gets queued waiting for the first
// deploy to complete. Then they make a third deploy, at which point we might as well
// cancel the second deploy, if it hasn't already started.
export async function cancelEarlierDeploys(deploy: Deploy) {
  const { Items: deploys } = await dynamoDB.executeStatement({
    Statement:
      "UPDATE deploys SET completed_at = ?, outcome = ?  WHERE deploy_id != ? AND branch_id = ? AND project_id = ? AND started_at IS NULL",
    Parameters: [
      { N: String(Date.now()) },
      { S: "cancelled" },
      { S: deploy.id },
      { S: deploy.branchId },
      { S: deploy.projectId },
    ],
  });
  await Promise.all(
    deploys.map(async (item) => await deleteS3Archive(item.id.S))
  );
}

// Count how many deploys are currently running for this project. We can
// throttle by number of concurrent deploys.
export async function countActiveDeploys(projectId: string) {
  const { Items: active } = await dynamoDB.executeStatement({
    Statement:
      "SELECT * FROM deploys WHERE project_id = ? AND started_at IS NOT NULL AND completed_at IS NULL",
    Parameters: [{ S: projectId }],
  });
  return active.length;
}

export async function markDeployStarted(deployId: string) {
  await dynamoDB.executeStatement({
    Statement: "UPDATE deploys SET started_at = ? WHERE id = ?",
    Parameters: [{ N: String(Date.now) }, { S: deployId }],
  });
}

export async function markDeployCompleted(
  deployId: string,
  status: DeployOutcome
) {
  await dynamoDB.executeStatement({
    Statement: "UPDATE deploys SET completed_at = ?, status = ? WHERE id = ?",
    Parameters: [{ N: String(Date.now()) }, { S: status }, { S: deployId }],
  });
  await deleteS3Archive(deployId);
}

export async function getNextWaitingDeploy(deploy: Deploy) {
  const { Items: waiting } = await dynamoDB.executeStatement({
    Statement:
      "SELECT * FROM deploys WHERE branch_id = ? AND project_id = ? AND started_at IS NULL AND completed_at IS NULL ORDER BY created_at ASC",
    Parameters: [{ S: deploy.branchId }, { S: deploy.projectId }],
  });
  return waiting[0]?.id.S;
}

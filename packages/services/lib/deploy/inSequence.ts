import ms from "ms";
import { AbortController, AbortSignal } from "node-abort-controller";
import {
  cancelEarlierDeploys,
  countActiveDeploys,
  Deploy,
  getDeploy,
  getNextWaitingDeploy,
  markDeployCompleted,
  markDeployStarted,
} from "./state";
import { readS3Archive } from "./storage";

type RunDeployHandler = ({
  // Zip with code to deploy
  archive,
  deploy,
  // Deploy cancelled by user or timed out
  signal,
}: {
  archive: Buffer;
  deploy: Deploy;
  signal: AbortSignal;
}) => Promise<void>;

// We use this to deploy in sequence.
//
// We want to avoid a race condition: when user starts two deploys on the same
// branch, they must run in order.
//
// While the first deploy is running, it blocks the second deploy. We can also
// use this strategy to limit to N deploys across a project, team, etc.
//
// We can't block the job, so if we determine another deploy is running, we end
// the job early. And so, whenever a deploy finishes, it needs to look for any
// other waiting deploy, and queue a job to run it.
//
// We use the database to track the state of each deploy. We don't have locks,
// but we can avoid a race condition by using a FIFO queue. That guarantees all
// jobs for the same project/branch run in sequence.
//
// A queued job will either:
// - Determine it's blocked by another deploy and finish early
// - Determine another job failed to complete this deploy, queue the next deploy, finish early
// - Run this deploy until it completes or times out
//
export async function deployInSequence(
  {
    deployId,
    signal,
  }: {
    deployId: string;
    signal: AbortSignal;
  },
  runDeploy: RunDeployHandler
) {
  console.info("Starting deploy %s", deployId);

  const deploy = await getDeploy(deployId);
  if (!deploy) return console.error("Deploy %s not found, bailing", deployId);

  // FIFO guarantees that deploy jobs run in order, and we don't have duplicates
  // in the queue. The same deploy can run in parallel, if the previous run
  // crashed or timed out.
  if (deploy.startedAt) {
    console.info(
      "Deploy %s not finished in time, marking as failed, and scheduling next deploy",
      deployId
    );
    if (!deploy.completedAt) await markDeployCompleted(deployId, "failed");
    // If there's doubt, we call queueNextDeploy
    return queueNextDeploy(deploy);
  }

  // If there are other deploys waiting to run cancel them, we only want the
  // most recent deploy
  await cancelEarlierDeploys(deploy);

  // We only allow user to have one running deploy at a time
  if ((await countActiveDeploys(deploy.projectId)) > 0) {
    console.info("Deploy %s blocked, another deploy is in progress", deployId);
    return;
  }

  await markDeployStarted(deployId);
  try {
    await watchDeployStatus({ deployId, signal }, async (signal) => {
      const archive = await readS3Archive(deployId);
      await runDeploy({ archive, deploy, signal });

      if (signal.aborted) return;
      await markDeployCompleted(deployId, "success");
      console.info("Deploy %s completed successfully", deployId);
    });
  } catch (error) {
    console.error("Deploy %s failed", deployId, error);
    await markDeployCompleted(deployId, "failed");
  }
  return await queueNextDeploy(deploy);
}

async function watchDeployStatus(
  { deployId, signal: timeout }: { deployId: string; signal: AbortSignal },
  cb: (signal: AbortSignal) => Promise<void>
) {
  const cancel = new AbortController();
  timeout.addEventListener("abort", () => cancel.abort());

  setInterval(async function pollDeployStatus() {
    const deploy = await getDeploy(deployId);
    if (!deploy || deploy.completedAt) cancel.abort();
  }, ms("5s"));

  try {
    await Promise.race([
      cb(cancel.signal),
      new Promise((resolve) =>
        cancel.signal.addEventListener("abort", resolve)
      ),
    ]);
    if (timeout.aborted) throw new Error("Deploy timed out");
    if (cancel.signal.aborted) throw new Error("Deploy cancelled by user");
  } finally {
    cancel.abort();
  }
}

// When we're done with this deploy, queue the next waiting deploy
async function queueNextDeploy(deploy: Deploy) {
  const nextDeployId = await getNextWaitingDeploy(deploy);
  if (nextDeployId) {
    // TODO queue with { deployId } groupId = project/branch
  }
}

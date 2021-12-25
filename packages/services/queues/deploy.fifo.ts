import { deployInSequence } from "../lib/deploy/inSequence";
import withSourceDir from "../lib/deploy/withSourceDir";

export default async function deployJob(
  { deployId }: { deployId: string },
  { params, signal }: { params: { projectId: string }; signal: AbortSignal }
) {
  console.log({ params });
  await deployInSequence(
    { deployId, signal },
    async ({ archive, deploy, signal }) =>
      withSourceDir({ archive, signal }, async (sourceDir) => {
        console.log("Deploying...");
      })
  );
}

export const config = {};

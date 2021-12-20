import deployProject from "../lib/deploy/deployProject";
import { deployInSequence } from "../lib/deploy/inSequence";

export default async function deployJob(
  { deployId }: { deployId: string },
  { params, signal }: { params: { projectId: string }; signal: AbortSignal }
) {
  console.log({ params });
  await deployInSequence(
    { deployId, signal },
    async ({ archive, deploy, signal }) => {
      deployProject({ archive, deploy, signal });
    }
  );
}

export const config = {
  url: "/project/:group/deploy/",
  accepts: "application/json",
};

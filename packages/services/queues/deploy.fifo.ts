import { deployProject } from "@queue-run/builder";
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
      withSourceDir(
        { archive, signal },
        async (sourceDir) =>
          await deployProject({
            config: {
              project: deploy.projectId,
              branch: deploy.branchId,
            },
            signal,
            sourceDir,
          })
      )
  );
}

export const config = {
  url: "/project/:group/deploy/",
  accepts: "application/json",
};

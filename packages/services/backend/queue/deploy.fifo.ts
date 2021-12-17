import deployProject from "../../lib/deploy/deployProject";
import { deployInSequence } from "../../lib/deploy/inSequence";

export default async function deployJob(
  { deployId }: { deployId: string },
  { signal }: { signal: AbortSignal }
) {
  await deployInSequence(
    { deployId, signal },
    async ({ archive, deploy, signal }) => {
      deployProject({ archive, deploy, signal });
    }
  );
}

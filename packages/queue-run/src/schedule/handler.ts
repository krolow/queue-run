import invariant from "tiny-invariant";
import { NewExecutionContext } from "../shared/executionContext";
import { withExecutionContext } from "../shared/executionContext.js";
import { loadModule } from "../shared/loadModule.js";
import logger from "../shared/logger.js";
import { loadManifest } from "../shared/manifest.js";
import { ScheduledJobError, ScheduleExports } from "./exports.js";

export default async function handleScheduledJob({
  jobId,
  newExecutionContext,
  name,
}: {
  jobId: string;
  newExecutionContext: NewExecutionContext;
  name: string;
}): Promise<void> {
  const { schedules } = await loadManifest();
  const schedule = Array.from(schedules.values()).find(
    (schedule) => schedule.name === name
  );
  if (!schedule) throw new Error(`No handler for schedule ${name}`);

  const loaded = await loadModule<ScheduleExports, never>(`schedules/${name}`);
  invariant(loaded, "Could not load scheduled module");

  const { module } = loaded;
  const timeout = schedule.timeout;

  try {
    await withExecutionContext(
      newExecutionContext({ timeout }),
      async (context) => {
        const metadata = {
          name,
          jobId,
          cron: schedule.cron,
          signal: context.signal,
        };
        logger.emit("jobStarted", metadata);
        await module.default(metadata);
        logger.emit("jobFinished", metadata);
      }
    );
  } catch (error) {
    throw new ScheduledJobError(error, { name, jobId });
  }
}

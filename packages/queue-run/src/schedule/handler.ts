import { AbortController } from "node-abort-controller";
import invariant from "tiny-invariant";
import { loadModule } from "../shared/loadModule.js";
import { LocalStorage, withLocalStorage } from "../shared/localStorage.js";
import { loadManifest } from "../shared/manifest.js";
import TimeoutError from "../shared/TimeoutError.js";
import { logger } from "./../shared/logging.js";
import { ScheduledJobError, ScheduleExports } from "./exports.js";

export default async function handleScheduledJob({
  jobId,
  newLocalStorage,
  name,
}: {
  jobId: string;
  newLocalStorage: () => LocalStorage;
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
  const controller = new AbortController();
  const abortTimeout = setTimeout(() => controller.abort(), timeout * 1000);
  const { signal } = controller;
  const metadata = { name, jobId, cron: schedule.cron, signal };

  try {
    logger.emit("jobStarted", metadata);
    await Promise.race([
      await withLocalStorage(newLocalStorage(), async () => {
        await module.default(metadata);
      }),

      new Promise((resolve) => {
        signal.addEventListener("abort", resolve);
      }),
    ]);
    if (signal.aborted) {
      throw new TimeoutError(
        `Job aborted: job took longer than ${timeout}s to process`
      );
    }
    logger.emit("jobFinished", metadata);
  } catch (error) {
    throw new ScheduledJobError(error, metadata);
  } finally {
    clearTimeout(abortTimeout);
    controller.abort();
  }
}

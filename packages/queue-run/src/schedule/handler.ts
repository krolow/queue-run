import { AbortController } from "node-abort-controller";
import invariant from "tiny-invariant";
import { loadModule } from "../shared/loadModule.js";
import { LocalStorage, withLocalStorage } from "../shared/localStorage.js";
import { logError, logJobFinished, logJobStarted } from "../shared/logging.js";
import { loadManifest } from "../shared/manifest.js";
import TimeoutError from "../shared/TimeoutError.js";
import {
  ScheduledJobMetadata,
  ScheduleExports,
  ScheduleMiddleware,
} from "./exports.js";

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

  const loaded = await loadModule<ScheduleExports, ScheduleMiddleware>(
    `schedules/${name}`,
    {
      onJobStarted: logJobStarted,
      onJobFinished: logJobFinished,
      onError: logError,
    }
  );
  invariant(loaded, "Could not load scheduled module");

  const { module, middleware } = loaded;

  // When handling FIFO messges, possible we'll run out of time.

  // Create an abort controller to allow the handler to cancel incomplete work.
  const timeout = schedule.timeout;
  const controller = new AbortController();
  const abortTimeout = setTimeout(() => controller.abort(), timeout * 1000);
  const { signal } = controller;

  const metadata = { name, jobId, cron: schedule.cron, signal };

  try {
    await Promise.race([
      runWithMiddleware({ metadata, middleware, module, newLocalStorage }),

      new Promise((resolve) => {
        signal.addEventListener("abort", resolve);
      }),
    ]);
    if (signal.aborted) {
      throw new TimeoutError(
        `Job aborted: job took longer than ${timeout}s to process`
      );
    }
  } catch (error) {
    console.error('Error in schedule "%s" job %s:', name, jobId, error);

    if (middleware.onError) {
      try {
        await middleware.onError(
          error instanceof Error ? error : new Error(String(error)),
          metadata
        );
      } catch (error) {
        console.error(
          'Error in onError handler for schedule "%s"',
          name,
          error
        );
      }
    }
  } finally {
    clearTimeout(abortTimeout);
    controller.abort();
  }
}

async function runWithMiddleware({
  metadata,
  middleware,
  module,
  newLocalStorage,
}: {
  metadata: ScheduledJobMetadata;
  middleware: ScheduleMiddleware;
  module: ScheduleExports;
  newLocalStorage: () => LocalStorage;
}) {
  const { signal } = metadata;
  await withLocalStorage(newLocalStorage(), async () => {
    if (middleware.onJobStarted) await middleware.onJobStarted(metadata);
    if (signal.aborted) return;

    await module.default(metadata);
    if (signal.aborted) return;

    if (middleware.onJobFinished) await middleware.onJobFinished(metadata);
  });
}

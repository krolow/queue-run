import { AbortController } from "node-abort-controller";
import invariant from "tiny-invariant";
import type { JSONObject } from "../json";
import { loadModule } from "../shared/loadModule.js";
import {
  getLocalStorage,
  LocalStorage,
  withLocalStorage,
} from "../shared/localStorage.js";
import { logger } from "../shared/logging.js";
import { loadManifest } from "../shared/manifest.js";
import TimeoutError from "../shared/TimeoutError.js";
import { QueuedJobError, QueuedJobMetadata, QueueExports } from "./exports.js";

export default async function handleQueuedJob({
  metadata,
  newLocalStorage,
  payload,
  queueName,
  remainingTime,
}: {
  metadata: Omit<QueuedJobMetadata, "signal">;
  newLocalStorage: () => LocalStorage;
  payload: string | Buffer | object;
  queueName: string;
  remainingTime: number;
}) {
  const { queues } = await loadManifest();
  const queue = queues.get(queueName);
  if (!queue) throw new Error(`No handler for queue ${queueName}`);

  const loaded = await loadModule<QueueExports, never>(`queues/${queueName}`);
  invariant(loaded, "Could not load queue module");
  const { module } = loaded;

  // When handling FIFO messges, possible we'll run out of time.
  const timeout = Math.min(queue.timeout * 1000, remainingTime);
  if (timeout <= 0) return false;

  // Create an abort controller to allow the handler to cancel incomplete work.
  const controller = new AbortController();
  const abortTimeout = setTimeout(() => controller.abort(), timeout);
  const { signal } = controller;

  try {
    logger.emit("jobStarted", metadata);
    await Promise.race([
      await withLocalStorage(newLocalStorage(), async () => {
        getLocalStorage().user = metadata.user;
        await module.default(payload as JSONObject, {
          ...metadata,
          signal,
        });
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
    throw new QueuedJobError(error, metadata);
  } finally {
    clearTimeout(abortTimeout);
    controller.abort();
  }
}

import invariant from "tiny-invariant";
import type { JSONObject } from "../json";
import { NewExecutionContext } from "../shared/executionContext";
import { withExecutionContext } from "../shared/executionContext.js";
import { loadModule } from "../shared/loadModule.js";
import logger from "../shared/logger.js";
import { loadManifest } from "../shared/manifest.js";
import { QueuedJobError, QueuedJobMetadata, QueueExports } from "./exports.js";

export default async function handleQueuedJob({
  metadata,
  newExecutionContext,
  payload,
  queueName,
  remainingTime,
}: {
  metadata: Omit<QueuedJobMetadata, "signal">;
  newExecutionContext: NewExecutionContext;
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
  const timeout = Math.min(queue.timeout, remainingTime / 1000);
  if (timeout <= 0) return false;

  try {
    await withExecutionContext(
      newExecutionContext({ timeout }),
      async (context) => {
        context.user = metadata.user;
        logger.emit("queueStarted", metadata);
        await module.default(payload as JSONObject, {
          ...metadata,
          signal: context.signal,
        });
        logger.emit("queueFinished", metadata);
      }
    );
  } catch (error) {
    throw new QueuedJobError(error, metadata);
  }
}

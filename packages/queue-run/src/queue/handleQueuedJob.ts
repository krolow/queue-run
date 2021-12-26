import chalk from "chalk";
import { AbortController } from "node-abort-controller";
import invariant from "tiny-invariant";
import loadModule from "../loadModule";
import { getLocalStorage, LocalStorage } from "../localStorage";
import { QueueExports, QueueHandlerMetadata, QueueMiddleware } from "../types";
import loadQueues from "./loadQueues";

export default async function handleQueuedJob({
  metadata,
  newLocalStorage,
  payload,
  queueName,
  remainingTime,
}: {
  metadata: Omit<QueueHandlerMetadata, "signal">;
  newLocalStorage: () => LocalStorage;
  payload: string | Buffer | object;
  queueName: string;
  remainingTime: number;
}): Promise<boolean> {
  const queue = (await loadQueues()).get(queueName);
  if (!queue) throw new Error(`No handler for queue ${queueName}`);
  const loaded = await loadModule<QueueExports, QueueMiddleware>(
    `queues/${queueName}`
  );
  invariant(loaded, "Could not load queue module");

  const { module, middleware } = loaded;

  // When handling FIFO messges, possible we'll run out of time.
  const timeout = Math.min(queue.timeout * 1000, remainingTime);
  if (timeout <= 0) return false;

  // Create an abort controller to allow the handler to cancel incomplete work.
  const controller = new AbortController();
  const abortTimeout = setTimeout(() => controller.abort(), timeout * 1000);

  try {
    console.info("Handling job %s on queue %s", metadata.messageID, queueName);
    await Promise.race([
      getLocalStorage().run(newLocalStorage(), () => {
        getLocalStorage().getStore()!.user = metadata.user;
        module.default(payload, {
          ...metadata,
          signal: controller.signal,
        });
      }),

      new Promise((resolve) => {
        controller.signal.addEventListener("abort", resolve);
      }),
    ]);
    if (controller.signal.aborted) {
      throw new Error(`Timeout: job took longer than ${timeout}s to process`);
    }
    return true;
  } catch (error) {
    console.error(
      chalk.bold.red('Error in queue "%s" job %s:'),
      queueName,
      metadata.messageID,
      error
    );

    if (middleware.onError) {
      try {
        await middleware.onError(
          error instanceof Error ? error : new Error(String(error)),
          { ...metadata, signal: controller.signal }
        );
      } catch (error) {
        console.error(
          chalk.bold.red('Error in onError handler for queue "%s"'),
          queueName,
          error
        );
      }
    }

    return false;
  } finally {
    clearTimeout(abortTimeout);
    controller.abort();
  }
}

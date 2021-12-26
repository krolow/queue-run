import glob from "fast-glob";
import path from "path";
import loadModule from "../loadModule";
import { QueueExports, QueueMiddleware } from "../types";

const maxTimeout = 500;
const defaultTimeout = 30;

// Runtime definition for a queue handler
export type QueueService = {
  // Filename of the module
  filename: string;
  // True if this is a FIFO queue
  isFifo: boolean;
  // The queue name (not fully qualified)
  queueName: string;
  // Timeout in seconds
  timeout: number;
};

export default async function loadQueues(): Promise<Map<string, QueueService>> {
  const queues = new Map<string, QueueService>();
  const filenames = await glob("queues/[!_]*.{js,ts}");
  for (const filename of filenames) {
    try {
      const loaded = await loadModule<QueueExports, QueueMiddleware>(filename);
      if (!loaded) throw new Error(`Could not load module ${filename}`);
      const { module, middleware } = loaded;

      const handler = module.default;
      if (typeof handler !== "function")
        throw new Error("Expected queue handler to export a function");

      if (middleware.onError && typeof middleware.onError !== "function")
        throw new Error("Expected onError export to be a function");

      const queueName = queueNameFromFilename(filename);
      const isFifo = queueName.endsWith(".fifo");

      const config = module.config ?? {};
      queues.set(queueName, {
        filename,
        isFifo,
        queueName,
        timeout: getTimeout(config),
      });
    } catch (error) {
      throw new Error(`Error in "${filename}": ${error}`);
    }
  }
  return queues;
}

// queue/foo.fifo.js => foo.fifo
function queueNameFromFilename(filename: string): string {
  const queueName = path.basename(filename, path.extname(filename)).normalize();
  if (!/^[a-z0-9_-]+(\.fifo)?$/i.test(queueName))
    throw new Error(
      "Queue name must be alphanumeric, dash, or underscore, and optionally followed by '.fifo'"
    );
  if (queueName.length > 40)
    throw new Error("Queue name longer than the allowed 40 characters");
  return queueName;
}

function getTimeout({ timeout }: { timeout?: number }): number {
  if (timeout === undefined || timeout === null) return defaultTimeout;
  if (typeof timeout !== "number")
    throw new Error("config.timeout must be a number (seconds)");
  if (timeout < 1) throw new Error("config.timeout must be at least 1 second");
  if (timeout > maxTimeout)
    throw new Error(`config.timeout cannot be more than ${maxTimeout} seconds`);
  return timeout;
}

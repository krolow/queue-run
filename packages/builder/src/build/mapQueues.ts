import glob from "fast-glob";
import fs from "node:fs/promises";
import path from "node:path";
import type { Manifest, QueueExports } from "queue-run";
import { loadModule } from "queue-run";

const maxTimeout = 900; // 15 minute (Lambda maximum)
const defaultTimeout = 300; // 5 minutes

export default async function mapQueues(): Promise<Manifest["queues"]> {
  const filenames = await glob("queues/[!_]*.{mjs,js,ts}");
  return await Promise.all(
    filenames.map(async (filename) => {
      try {
        const loaded = await loadModule<QueueExports, never>(filename);
        if (!loaded) throw new Error(`Could not load module ${filename}`);
        const { module } = loaded;

        const handler = module.default;
        if (typeof handler !== "function")
          throw new Error("Expected queue handler to export a function");

        const queueName = queueNameFromFilename(filename);
        const isFifo = queueName.endsWith(".fifo");

        const config = module.config ?? {};
        return {
          queueName,
          filename,
          isFifo,
          original: await getOriginalFilename(filename),
          timeout: getTimeout(config),
        };
      } catch (error) {
        throw new Error(`Error in "${filename}": ${error}`);
      }
    })
  );
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

async function getOriginalFilename(filename: string) {
  const { sources } = JSON.parse(await fs.readFile(`${filename}.map`, "utf-8"));
  return sources[0];
}

import cronParser from "cron-parser";
import glob from "fast-glob";
// @ts-ignore
import friendlyCron from "friendly-node-cron";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  Manifest,
  QueueMiddleware,
  ScheduleExports,
  ScheduleMiddleware,
} from "queue-run";
import { loadModule } from "queue-run";

const maxTimeout = 900; // 15 minute (Lambda maximum)
const defaultTimeout = 300; // 5 minutes

export default async function mapSchedules(): Promise<Manifest["schedules"]> {
  const filenames = await glob("schedules/[!_]*.{mjs,js,ts}");
  return await Promise.all(
    filenames.map(async (filename) => {
      try {
        const loaded = await loadModule<ScheduleExports, ScheduleMiddleware>(
          filename
        );
        if (!loaded) throw new Error(`Could not load module ${filename}`);
        const { module, middleware } = loaded;

        const handler = module.default;
        if (typeof handler !== "function")
          throw new Error("Expected schedule handler to export a function");

        validateMiddleware(middleware);

        const name = scheduleNameFromFilename(filename);
        const cron = getSchedule(module.schedule);
        if (typeof cron !== "string")
          throw new Error("Expected module to export const schedule : string");

        const config = module.config ?? {};
        const timeout = getTimeout({
          cron,
          timeout: config.timeout,
        });

        return {
          cron,
          filename,
          name,
          original: await getOriginalFilename(filename),
          timeout,
        };
      } catch (error) {
        throw new Error(`Error in "${filename}": ${error}`);
      }
    })
  );
}

function getSchedule(schedule: string): string {
  // Very useful but not supported by friendly-node-cron:
  if (/^daily$/i.test(schedule)) return "0 0 * * *";
  if (/^hourly$/i.test(schedule)) return "0 * * * *";
  if (/^monthly$/i.test(schedule)) return "0 0 1 * *";

  // https://www.npmjs.com/package/friendly-node-cron
  const friendly = friendlyCron(schedule);
  if (friendly) return friendly;

  // Validate cron expression
  const parsed = cronParser.parseExpression(schedule);
  if (parsed) return schedule;
  throw new Error(`Invalid schedule: ${schedule}`);
}

// schedules/daily.js => daily
function scheduleNameFromFilename(filename: string): string {
  const name = path.basename(filename, path.extname(filename)).normalize();
  if (!/^[a-z0-9_-]+$/i.test(name))
    throw new Error("Schedule name must be alphanumeric, dash, or underscore");
  if (name.length > 40)
    throw new Error("Schedule name longer than the allowed 40 characters");
  return name;
}

function getTimeout({
  cron,
  timeout,
}: {
  cron: string;
  timeout: number | undefined | null;
}): number {
  const parsed = cronParser.parseExpression(cron);
  const [first, second] = [parsed.next(), parsed.next()];
  const spacing =
    first && second ? (second.getTime() - first.getTime()) / 1000 : undefined;

  if (timeout === undefined || timeout === null)
    return spacing ? Math.min(spacing, maxTimeout) : defaultTimeout;
  if (typeof timeout !== "number")
    throw new Error("config.timeout must be a number (seconds)");
  if (timeout < 1) throw new Error("config.timeout must be at least 1 second");
  if (timeout > maxTimeout)
    throw new Error(`config.timeout cannot be more than ${maxTimeout} seconds`);
  if (spacing && timeout > spacing)
    throw new Error(
      "config.timeout cannot be greater than duration between runs"
    );
  return timeout;
}

async function getOriginalFilename(filename: string) {
  const { sources } = JSON.parse(await fs.readFile(`${filename}.map`, "utf-8"));
  return sources[0];
}

function validateMiddleware(middleware: ScheduleMiddleware): void {
  (
    ["onError", "onJobStarted", "onJobFinished"] as Array<keyof QueueMiddleware>
  ).forEach((key) => {
    if (middleware[key] && typeof middleware[key] !== "function")
      throw new Error(`Exported ${key} must be a function`);
  });
}

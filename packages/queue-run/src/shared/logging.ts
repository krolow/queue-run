import chalk, { ChalkInstance } from "chalk";
import filesize from "filesize";
import EventEmitter from "node:events";
import { URL } from "node:url";
import { formatWithOptions } from "node:util";
import { QueuedJobMetadata as QueueJobMetadata } from "../queue/exports.js";
import { ScheduledJobMetadata as ScheduleJobMetadata } from "../schedule/exports.js";
import { WebSocketRequest } from "../ws/exports.js";
import { HTTPRequestError } from "./../http/exports";
import { QueuedJobError } from "./../queue/exports";
import { ScheduledJobError } from "./../schedule/exports";
import { WebSocketError } from "./../ws/exports";

export type LogLevel = "debug" | "verbose" | "info" | "warn" | "error";

const showDebug =
  process.env.NODE_ENV === "development"
    ? process.env.DEBUG !== "false"
    : process.env.DEBUG === "true";

global.console.debug = (...args: unknown[]) =>
  showDebug ? logger.emit("log", "debug", ...args) : undefined;
global.console.log = (...args: unknown[]) =>
  logger.emit("log", "verbose", ...args);
global.console.info = (...args: unknown[]) =>
  logger.emit("log", "info", ...args);
global.console.warn = (...args: unknown[]) =>
  logger.emit("log", "warn", ...args);
global.console.error = (...args: unknown[]) =>
  logger.emit("log", "error", ...args);

export const logger = new EventEmitter();

const colors: Record<LogLevel, ChalkInstance> = {
  debug: chalk.dim,
  error: chalk.bold.red,
  info: chalk.white,
  verbose: chalk.white,
  warn: chalk.bold.yellow,
};

const formatOptions = {
  compact: true,
  colors: process.stdout.hasColors && process.stdout.hasColors(),
};

logger.on("log", (level: LogLevel, ...args: unknown[]) => {
  const [message, ...rest] = args;
  // we want to apply a color to the message, but not if the user is doing
  // console.log({ variable }).
  const withColor =
    typeof message === "string" ? colors[level]?.(message) : message;

  const formatted = formatWithOptions(formatOptions, withColor, ...rest);
  const stream =
    level === "error" || level === "warn" ? process.stderr : process.stdout;
  stream.write(formatted + "\n");
});

logger.on("response", async (request: Request, response: Response) => {
  console.info(
    '[%s] "%s %s" %s %d "%s" "%s"',
    request.headers.get("X-Forwarded-For"),
    request.method,
    new URL(request.url).pathname,
    response.status,
    (await response.clone().arrayBuffer()).byteLength,
    request.headers.get("Referer") ?? "",
    request.headers.get("User-Agent") ?? ""
  );
});

logger.on("jobStarted", (job: QueueJobMetadata | ScheduleJobMetadata) => {
  if ("queueName" in job) {
    console.info(
      'Job started: queue="%s" jobId="%s" received=%d seq=%s',
      job.queueName,
      job.jobId,
      job.receivedCount,
      job.sequenceNumber ?? "--"
    );
  } else {
    console.info(
      'Job started: name="%s" schedule="%s" job="%s"',
      job.name,
      job.cron,
      job.jobId
    );
  }
});

logger.on("jobFinished", (job: QueueJobMetadata | ScheduleJobMetadata) => {
  if ("queueName" in job) {
    console.info(
      'Job finished: queue="%s" jobId="%s"',
      job.queueName,
      job.jobId
    );
  } else {
    console.info('Job finished: name="%s" jobId="%s"', job.name, job.jobId);
  }
});

logger.on("messageReceived", (request: WebSocketRequest) => {
  const { connectionId, user, data } = request;
  const message =
    typeof data === "string"
      ? filesize(data.length)
      : Buffer.isBuffer(data)
      ? filesize(data.byteLength)
      : "json";

  console.info(
    "connection: %s user: %s message: %s",
    connectionId,
    user?.id ?? "anonymous",
    message
  );
});

process.on("unhandledRejection", (error: Error) => {
  reportError(error);
  setTimeout(() => process.exit(1), 500);
});

process.on("uncaughtException", (error: Error) => {
  reportError(error);
  setTimeout(() => process.exit(1), 500);
});

logger.on("error", (error: Error) => {
  if (error instanceof HTTPRequestError) {
    const { method, url } = error.request;
    console.error(
      '"%s %s" error: %s',
      method,
      new URL(url).pathname,
      error,
      error.stack
    );
  } else if (error instanceof WebSocketError) {
    const { connectionId, requestId } = error;
    console.error(
      "connection: %s request: %s error: %s",
      connectionId,
      requestId,
      error,
      error.stack
    );
  } else if (error instanceof QueuedJobError) {
    const { jobId, queueName } = error;
    console.error(
      "Queued job failed on %s: %s: %s",
      queueName,
      jobId,
      String(error),
      error.stack
    );
  } else if (error instanceof ScheduledJobError) {
    const { jobId, queueName: name } = error;
    console.error(
      "Scheduled job failed on %s: %s: %s",
      name,
      jobId,
      String(error),
      error.stack
    );
  } else {
    console.error("Error: %s", String(error), error.stack);
  }
});

process.removeAllListeners("warning");
process.on("warning", (warning: Error) => {
  console.warn(warning.message);
});

/**
 * Use this to report errors to the global error handler.
 */
export function reportError(error: Error) {
  // @ts-ignore
  logger.emit("error", error);
}

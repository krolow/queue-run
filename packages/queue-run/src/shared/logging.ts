/* eslint-disable no-unused-vars */
import chalk, { ChalkInstance } from "chalk";
import filesize from "filesize";
import { EventEmitter } from "node:events";
import { URL } from "node:url";
import { formatWithOptions } from "node:util";
import { QueuedJobMetadata as QueueJobMetadata } from "../queue/exports.js";
import { ScheduledJobMetadata as ScheduleJobMetadata } from "../schedule/exports.js";
import { WebSocketRequest } from "../ws/exports.js";
import { HTTPRequestError } from "./../http/exports.js";
import { QueuedJobError } from "./../queue/exports.js";
import { ScheduledJobError } from "./../schedule/exports.js";
import { WebSocketError } from "./../ws/exports.js";

export type LogLevel = "debug" | "verbose" | "info" | "warn" | "error";

declare interface Logger {
  /**
   * Emitted for every call to console.log, console.info, etc
   *
   * @param event log
   * @param listener Log level and arguments for log function
   */
  on(
    event: "log",
    listener: (level: LogLevel, ...args: unknown[]) => void
  ): this;
  emit(event: "log", level: LogLevel, ...args: unknown[]): boolean;
}

// eslint-disable-next-line no-redeclare
class Logger extends EventEmitter {
  constructor() {
    super();
  }
}

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

export const logger = new Logger();

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

logger.on("log", (level, ...args) => {
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

// eslint-disable-next-line no-redeclare
declare interface Logger {
  /**
   * This event emitted on every HTTP request.
   *
   * @param event request
   * @param listener Called with HTTP request object
   */
  on(event: "request", listener: (request: Request) => void): this;
  emit(event: "request", request: Request): boolean;

  /**
   * This event emitted on every HTTP response.
   *
   * @param event response
   * @param listener Called with HTTP request and response objects
   */
  on(
    event: "response",
    listener: (request: Request, response: Response) => void
  ): this;
  emit(event: "response", request: Request, response: Response): boolean;

  /**
   * This event emitted on every queue or scheduled job.
   *
   * @param event jobStarted
   * @param listener Called with event metadata
   */
  on(
    event: "jobStarted",
    listener: (job: QueueJobMetadata | ScheduleJobMetadata) => void
  ): this;
  emit(
    event: "jobStarted",
    job: QueueJobMetadata | ScheduleJobMetadata
  ): boolean;

  /**
   * This event emitted on every queue or scheduled job that finished successfully.
   *
   * @param event jobFinished
   * @param listener Called with event metadata
   */
  on(
    event: "jobFinished",
    listener: (job: QueueJobMetadata | ScheduleJobMetadata) => void
  ): this;
  emit(
    event: "jobFinished",
    job: QueueJobMetadata | ScheduleJobMetadata
  ): boolean;

  /**
   * This event emitted on every WebSocket request from the client.
   *
   * @param event messageReceived
   * @param listener Called with the WebSocket request
   */
  on(
    event: "messageReceived",
    listener: (request: WebSocketRequest) => void
  ): this;
  emit(event: "messageReceived", request: WebSocketRequest): boolean;

  /**
   * This event emitted on every WebSocket message sent to the client.
   *
   * @param event messageSent
   * @param listener Called with the message sent and connection IDs
   */
  on(
    event: "messageSent",
    listener: (sent: { connections: string[]; data: Buffer }) => void
  ): this;
  emit(
    event: "messageSent",
    sent: { connections: string[]; data: Buffer }
  ): boolean;

  /**
   * Emitted on uncaught exception, unhandled promise, and for reportError.
   *
   * @param event error
   * @param listener The Error object
   */
  on(event: "error", listener: (error: Error) => void): this;
  emit(event: "error", error: Error): boolean;
}

logger.on("response", async (request, response) => {
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

logger.on("jobStarted", (job) => {
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

logger.on("jobFinished", (job) => {
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

logger.on("messageReceived", (request) => {
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

// Node had a default handler that shows an error,
// we prefer to show a warning
process.removeAllListeners("warning");
process.on("warning", (warning: Error) => {
  console.warn(warning.message);
});

/**
 * Use this to report errors to the global error handler.
 *
 * Calling this function emits an "error" event with the Error object,
 * in addition to calling console.error to output the error.
 *
 * This can be used for error logging and reporting.
 *
 * Different from console.error which can be called with any output,
 * not specifically an Error object.
 *
 * @param error The Error object
 */
export function reportError(error: Error) {
  // @ts-ignore
  logger.emit("error", error);
}

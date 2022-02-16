import chalk, { ChalkInstance } from "chalk";
import filesize from "filesize";
import { EventEmitter } from "node:events";
import { URL } from "node:url";
import { formatWithOptions } from "node:util";
import { QueuedJobMetadata as QueueJobMetadata } from "../queue/exports.js";
import { ScheduledJobMetadata as ScheduleJobMetadata } from "../schedule/exports.js";
import { WebSocketRequest } from "../ws/exports.js";

type LogLevel = "debug" | "verbose" | "info" | "warn" | "error";

class Logger extends EventEmitter {
  constructor() {
    super();
  }
}

/**
 * Central point for logging.
 *
 * Generic:
 * @event log console.log, console.error, etc emit this event
 * @event error reportError and other error handlers emit this event
 * @event flush emitted before exiting the process
 *
 * Other events emitted by this class belong to more specific categories:
 * HTTP request/response, WS message sent/received, job started/finished, etc.
 */
/* eslint-disable no-unused-vars */
// eslint-disable-next-line no-redeclare
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

  /**
   * Emitted on reportError. You can redirect uncaught exception and unhandled
   * promise rejection here as well.
   *
   * @param event error
   * @param listener The Error object
   */
  on(event: "error", listener: (error: Error) => void): this;
  emit(event: "error", error: Error): boolean;

  /**
   * Emit this before process exit, and used to flush any messages to remote server.gq
   *
   * @param event flush
   */
  on(event: "flush"): this;
  emit(event: "flush"): boolean;
}
/* eslint-enable no-unused-vars */

export const logger = new Logger();

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

logger.on("error", (error: Error) => {
  console.error("Error: %s", String(error), error.stack);
});

// Node's default handler that shows an error, we prefer to show a warning
process.removeAllListeners("warning");
process.on("warning", (warning: Error) => {
  console.warn(warning.message);
});

process.on("beforeExit", () => logger.emit("flush"));

/* eslint-disable no-unused-vars */
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
   * This event emitted for every queued job.
   *
   * @param event queueStarted
   * @param listener Called with job metadata
   */
  on(
    event: "queueStarted",
    listener: (job: Omit<QueueJobMetadata, "signal">) => void
  ): this;
  emit(event: "queueStarted", job: Omit<QueueJobMetadata, "signal">): boolean;

  /**
   * This event emitted for every queue job that finished successfully.
   *
   * @param event queueFinished
   * @param listener Called with job metadata
   */
  on(
    event: "queueFinished",
    listener: (job: Omit<QueueJobMetadata, "signal">) => void
  ): this;
  emit(event: "queueFinished", job: Omit<QueueJobMetadata, "signal">): boolean;

  /**
   * This event emitted for every scheduled job.
   *
   * @param event scheduleStarted
   * @param listener Called with job metadata
   */
  on(
    event: "scheduleStarted",
    listener: (job: Omit<ScheduleJobMetadata, "signal">) => void
  ): this;
  emit(
    event: "scheduleStarted",
    job: Omit<ScheduleJobMetadata, "signal">
  ): boolean;

  /**
   * This event emitted for every scheduled job that finished successfully.
   *
   * @param event scheduleFinished
   * @param listener Called with job metadata
   */
  on(
    event: "scheduleFinished",
    listener: (job: Omit<ScheduleJobMetadata, "signal">) => void
  ): this;
  emit(
    event: "scheduleFinished",
    job: Omit<ScheduleJobMetadata, "signal">
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
}
/* eslint-enable no-unused-vars */

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

logger.on("queueStarted", (job) => {
  console.info(
    'Queue started: "%s" jobId="%s" received=%d seq=%s',
    job.queueName,
    job.jobId,
    job.receivedCount,
    job.sequenceNumber ?? "--"
  );
});

logger.on("queueFinished", (job) => {
  console.info('Queue finished: "%s" jobId="%s"', job.queueName, job.jobId);
});

logger.on("scheduleStarted", (job) => {
  console.info(
    'Schedule started: "%s" schedule="%s" jobId="%s"',
    job.name,
    job.cron,
    job.jobId
  );
});

logger.on("scheduleFinished", (job) => {
  console.info('Schedule finished: "%s" jobId="%s"', job.name, job.jobId);
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

export default logger;

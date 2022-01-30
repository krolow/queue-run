import chalk, { ChalkInstance } from "chalk";
import filesize from "filesize";
import { URL } from "node:url";
import { formatWithOptions } from "node:util";
import { JobMetadata } from "../queue/exports.js";
import { WebSocketRequest } from "../ws/exports.js";

/**
 * The logging function. console.log and friends redirect here.
 *
 * - console.debug is controlled by the DEBUG environment variable
 * - console.log uses the level "verbose" to differentiate from console.info
 * - The first argument is typically but not necessarily the formatting string
 *
 * @param level The log level
 * @param args The log arguments
 */
// eslint-disable-next-line no-unused-vars
type LoggingFunction = (level: LogLevel, ...args: unknown[]) => void;

type LogLevel = "debug" | "verbose" | "info" | "warn" | "error";

let _logger: LoggingFunction = stdio;

const showDebug =
  process.env.NODE_ENV === "development"
    ? process.env.DEBUG !== "false"
    : process.env.DEBUG === "true";

global.console.debug = (...args: unknown[]) =>
  showDebug ? _logger("debug", ...args) : undefined;
global.console.log = (...args: unknown[]) => _logger("verbose", ...args);
global.console.info = (...args: unknown[]) => _logger("info", ...args);
global.console.warn = (...args: unknown[]) => _logger("warn", ...args);
global.console.error = (...args: unknown[]) => _logger("error", ...args);

/**
 * Use this to replace the logging function, or intercept logging calls.
 *
 * If called with no arguments, returns the current logger function.
 *
 * If called with a single argument, sets the new logger function, and returns
 * the previous one.
 *
 * @param newLogger The new logger function
 * @returns The current/previous logger function
 */
export default function logger(newLogger?: LoggingFunction) {
  if (newLogger) {
    const previous = _logger;
    _logger = newLogger;
    return previous;
  } else return _logger;
}

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

// Default logger uses stdout/stderr, supports colors when running in terminal
function stdio(level: LogLevel, ...args: unknown[]) {
  const [message, ...rest] = args;
  // we want to apply a color to the message, but not if the user is doing
  // console.log({ variable }).
  const withColor =
    typeof message === "string" ? colors[level]?.(message) : message;

  const formatted = formatWithOptions(formatOptions, withColor, ...rest);
  const stream =
    level === "error" || level === "warn" ? process.stderr : process.stdout;
  stream.write(formatted + "\n");
}

/**
 * Default middleware for HTTP routes logs the response.
 *
 * @param request HTTP request object
 * @param response HTTP response object
 */
export async function logResponse(request: Request, response: Response) {
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
}

/**
 * Default middleware that logs when a job starts running.
 *
 * @param job The job metadata
 */
export async function logJobStarted(job: JobMetadata) {
  console.info(
    'Job started: queue="%s" job="%s" received=%d seq=%s',
    job.queueName,
    job.jobId,
    job.receivedCount,
    job.sequenceNumber ?? "--"
  );
}

/**
 * Default middleware that logs when a job finished running successfully.
 *
 * @param job The job metadata
 */
export async function logJobFinished(job: JobMetadata) {
  console.info('Job finished: queue="%s" job="%s"', job.queueName, job.jobId);
}

/**
 * Default middleware for WebSocket logs all received messages.
 */
export async function logMessageReceived({
  connectionId,
  data,
  user,
}: {
  connectionId: string;
  data: unknown;
  user: { id: string; [key: string]: unknown } | null;
}) {
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
}

/**
 * The default OnError middleware.
 *
 * @param error The error that was thrown
 * @param reference The reference object (HTTP request, job metadata, etc.)
 */
export async function logError(error: Error, reference: unknown) {
  if (reference instanceof Request) {
    const { method, url } = reference as Request;
    console.error(
      '"%s %s" error: %s',
      method,
      new URL(url).pathname,
      String(error),
      error.stack
    );
  } else if (
    reference instanceof Object &&
    "jobId" in reference &&
    "queueName" in reference
  ) {
    const { jobId, queueName } = reference as JobMetadata;
    console.error(
      "Job failed on %s: %s: %s",
      queueName,
      jobId,
      String(error),
      error.stack
    );
  } else if (reference instanceof Object && "connectionId" in reference) {
    const { connectionId, user } = reference as WebSocketRequest;
    console.error(
      "connection: %s user: %s error: %s",
      connectionId,
      user?.id ?? "anonymous",
      String(error),
      error.stack
    );
  } else {
    console.error("Error: %s", String(error), error.stack);
  }
}

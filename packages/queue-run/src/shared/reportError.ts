import { HTTPRequestError } from "../http/exports.js";
import { QueuedJobError } from "../queue/exports.js";
import { ScheduledJobError } from "../schedule/exports.js";
import { WebSocketError } from "../ws/exports.js";
import logger from "./logger.js";

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

export default function reportError(error: Error) {
  // @ts-ignore
  logger.emit("error", error);
}
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

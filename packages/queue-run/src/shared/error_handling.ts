import { HTTPRequestError } from "../http/exports.js";
import { QueuedJobError } from "../queue/exports.js";
import { ScheduledJobError } from "../schedule/exports.js";
import { WebSocketError } from "../ws/exports.js";
import logger, { reportError } from "./logger.js";

const exitDelay = 500;

process.on("unhandledRejection", onFatalError);
process.on("uncaughtException", onFatalError);

function onFatalError(error: Error) {
  reportError(error);
  logger.emit("flush");
  setTimeout(() => process.exit(1), exitDelay);
}

logger.removeAllListeners("error");
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
    const { jobId, scheduleName } = error;
    console.error(
      "Scheduled job failed on %s: %s: %s",
      scheduleName,
      jobId,
      String(error),
      error.stack
    );
  } else {
    console.error("Error: %s", String(error), error.stack);
  }
});

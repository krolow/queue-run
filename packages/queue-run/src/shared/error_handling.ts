import { HTTPRequestError } from "../http/exports.js";
import { QueuedJobError } from "../queue/exports.js";
import { ScheduledJobError } from "../schedule/exports.js";
import { WebSocketError } from "../ws/exports.js";
import logger, { reportError } from "./logger.js";

process.on("unhandledRejection", reportError);
process.on("uncaughtException", reportError);

logger.removeAllListeners("error");
logger.on("error", (error: Error) => {
  if (error instanceof HTTPRequestError) {
    const { method, url } = error.request;
    console.error(
      'HTTP request method="%s" path="%s"\n%s',
      method,
      new URL(url).pathname,
      error.stack ?? error
    );
  } else if (error instanceof WebSocketError) {
    const { connectionId, requestId } = error;
    console.error(
      'WS connectionId="%s" requestId="%s"\n%s',
      connectionId,
      requestId,
      error.stack ?? error
    );
  } else if (error instanceof QueuedJobError) {
    const { jobId, queueName } = error;
    console.error(
      'Queued job "%s" failed jobId="%s"\n%s',
      queueName,
      jobId,
      error.stack ?? error
    );
  } else if (error instanceof ScheduledJobError) {
    const { jobId, scheduleName } = error;
    console.error(
      'Scheduled job "%s" failed jobId="%s"\n%s',
      scheduleName,
      jobId,
      error.stack ?? error
    );
  } else {
    console.error("%s", error.stack ?? error);
  }
});

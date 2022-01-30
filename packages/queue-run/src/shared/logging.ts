import filesize from "filesize";
import { URL } from "node:url";
import { JobMetadata } from "../queue/exports.js";
import { WebSocketRequest } from "../ws/exports.js";

export { default as logger } from "./logger.js";

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

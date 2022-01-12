/* eslint-disable no-unused-vars */
import type { AbortSignal } from "node-abort-controller";
import { OnError } from "../shared/index.js";

/**
 * Queued job handler.
 *
 * When using TypeScript, you can type the request object:
 *
 * ```
 * const handler : QueueHandler<{ id: string; amount: number }> = (payload) => {
 *   console.log("Payload: %s %n", payload.id, payload.amount);
 * };
 *
 * export default handler;
 * ```
 *
 * @param payload The job payload: object, string, or Buffer
 * @param metadata Metadata about the job
 */
export type QueueHandler<T = Payload, P = Params> = (
  payload: T,
  metadata: JobMetadata<P>
) => Promise<void> | void;

/**
 * FIFO queue handler is similar to standard queue handler, but also has
 * access to group ID and sequence number.
 */
export type FIFOQueueHandler<T, P> = QueueHandler<T, P> & {
  metadata: JobMetadata<P & { group: string; dedupe?: string }> & {
    groupId: string;
    sequenceNumber: number;
  };
};

type Payload = string | Buffer | object;
type Params = { [key: string]: string | string[] };

/**
 * Job metadata.
 */
export type JobMetadata<P = Params> = {
  /**
   * The group ID. (FIFO queues only)
   */
  groupId: string | undefined;
  /**
   * The queue name.
   */
  queueName: string;
  /**
   * The job ID. (Unique for your project)
   */
  jobId: string;
  /**
   * Path parameters from the request URL.
   */
  params: P;
  /**
   * Approximate number of times this job was received from the queue for
   * processing.
   */
  receivedCount: number;
  /**
   * Time this job was queued.
   */
  queuedAt: Date;
  /**
   * The sequence number of this job within the group. (FIFO queues only)
   */
  sequenceNumber: number | undefined;
  /**
   * Abort signal notified when the job is aborted due to a timeout.
   */
  signal: AbortSignal;
  /**
   * If authenticated, this object has the user ID.
   */
  user: { id: string } | null;
};

/**
 * Export config object to control various aspects of job handling.
 */
export type QueueConfig = {
  /**
   * Timeout for processing the job (in seconds)
   *
   * @default 30 seconds
   */
  timeout?: number;
};

/**
 * Middleware that's called any time a job starts running.
 *
 * @param job The job metadata
 */
export type OnJobStarted = (job: JobMetadata) => Promise<void> | void;

/**
 * Middleware that's called any time a job finishes running successfully.
 *
 * @param job The job metadata
 */
export type OnJobFinished = (job: JobMetadata) => Promise<void> | void;

/**
 * Middleware exported from the queue module, or queues/_middleware.ts.
 */
export type QueueMiddleware = {
  onError?: OnError | null;
  onJobFinished?: OnJobFinished | null;
  onJobStarted?: OnJobStarted | null;
};

/**
 * Exported from the queue module.
 */
export type QueueExports = {
  default: QueueHandler;
  config?: QueueConfig;
} & QueueMiddleware;

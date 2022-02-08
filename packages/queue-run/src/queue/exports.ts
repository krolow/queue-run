/* eslint-disable no-unused-vars */
import type { AbortSignal } from "node-abort-controller";
import type { JSONObject, JSONValue } from "../json";

/**
 * Queued job handler.
 *
 * When using TypeScript, you can type the request object:
 *
 * ```
 * const handler : QueueHandler<{ id: string; amount: number }> = (payload) => {
 *   console.info("Payload: %s %n", payload.id, payload.amount);
 * };
 *
 * export default handler;
 * ```
 *
 * @param payload The job payload: object, string, or Buffer
 * @param metadata Metadata about the job
 */
export type QueueHandler<
  T extends Payload = JSONObject,
  P extends Params = Params
> = (payload: T, metadata: QueuedJobMetadata<P>) => Promise<void> | void;

/**
 * FIFO queue handler is similar to standard queue handler, but also has
 * access to group ID and sequence number.
 */
export type FIFOQueueHandler<
  T extends Payload = JSONObject,
  P extends Params = Params
> = QueueHandler<T, P> & {
  metadata: QueuedJobMetadata<P & { group: string; dedupe?: string }> & {
    groupId: string;
    sequenceNumber: number;
  };
};

type Payload = string | Buffer | JSONValue;
type Params = { [key: string]: string | string[] };

/**
 * Job metadata.
 */
export type QueuedJobMetadata<P = Params> = {
  /**
   * The group ID. (FIFO queues only)
   */
  groupId: string | undefined;
  /**
   * The job ID. (Unique for your project)
   */
  jobId: string;
  /**
   * The queue name.
   */
  queueName: string;
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
   * @default 5 minutes
   */
  timeout?: number;
};

export class QueuedJobError extends Error {
  readonly cause: unknown;
  readonly queueName: string;
  readonly jobId: string;

  constructor(
    cause: unknown,
    { jobId, queueName }: { jobId: string; queueName: string }
  ) {
    super(String(cause));
    this.cause = cause;
    this.jobId = jobId;
    this.queueName = queueName;
  }

  get stack() {
    return this.cause instanceof Error ? this.cause.stack! : super.stack!;
  }
}

/**
 * Exported from the queue module.
 */
export type QueueExports = {
  default: QueueHandler;
  config?: QueueConfig;
};

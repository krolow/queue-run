/* eslint-disable no-unused-vars */
import type { AbortSignal } from "node-abort-controller";
import { OnError } from "../shared/logError";

// Queue job handler.
//
// The first argument is the job.  The second argument includes message ID,
// URL parameters, user (if authenticated), abort signal, etc.
//
// When using TypeScript, you can type the request object:
//
// export default async function <Payload, { id: string }>(payload, { params }) {
//   // payload has type Payload
//   const id = params.id;
//   // id has type string
//   . . .
// }
export type QueueHandler<T = Payload, P = Params> = (
  payload: T,
  metadata: QueueHandlerMetadata<P>
) => Promise<void> | void;

// FIFO queue handler will always have group ID and sequence number.
export type FIFOQueueHandler<T, P> = QueueHandler<T, P> & {
  metadata: QueueHandlerMetadata<P & { group: string; dedupe?: string }> & {
    groupID: string;
    sequenceNumber: number;
  };
};

type Payload = string | Buffer | object;
type Params = { [key: string]: string | string[] };

export type QueueHandlerMetadata<P = Params> = {
  // Group ID (FIFO queue only)
  groupID: string | undefined;
  // The queue name
  queueName: string;
  // Unique job ID
  jobID: string;
  // Parameters from the request URL, eg /project/:projectId will have the parameter `projectId`
  params: P;
  // Number of times message was received
  receivedCount: number;
  // Timestamp when message was sent
  sentAt: Date;
  // Sequence number (FIFO queue only)
  sequenceNumber: number | undefined;
  // Notified when reached timeout, message will be rejected
  signal: AbortSignal;
  // If authenticted, the user ID
  user: { id: string } | null;
};

// You can export this to control some aspects of the processing.
//
// export const config = {
//   timeout: 60
// };
export type QueueConfig = {
  // Timeout for processing message in seconds. Defaults to 30.
  timeout?: number;
};

export type OnJobStarted = (job: QueueHandlerMetadata) => Promise<void> | void;
export type OnJobFinished = (job: QueueHandlerMetadata) => Promise<void> | void;

// Queue middleware.
export type QueueMiddleware = {
  onError?: OnError | null;
  onJobFinished?: OnJobFinished | null;
  onJobStarted?: OnJobStarted | null;
};

// All of these can be exported from the module.  The default export is required.
export type QueueExports = {
  default: QueueHandler;
  config?: QueueConfig;
} & QueueMiddleware;

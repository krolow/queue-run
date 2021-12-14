import type { JSONObject } from "./payload";

export declare type QueueHandler = (
  payload: JSONObject | string,
  metadata: {
    // Group ID (FIFO queue only)
    groupID?: string;
    // Unique message ID
    messageID: string;
    // Number of times message was received
    receivedCount: number;
    // Timestamp when message was sent
    sentAt: Date;
    // Sequence number (FIFO queue only)
    sequenceNumber?: number;
    // Notified when reached timeout, message will be rejected
    signal: AbortSignal;
  }
) => Promise<void> | void;

export declare type QueueConfig = {
  // Timeout for processing message in seconds. Defaults to 30.
  timeout: number;
};

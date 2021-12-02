import { JSONObject } from "./payload";

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
  }
) => Promise<void> | void;

export declare type QueueConfig = {
  // If this is true, then we'll create a FIFO queue. (default: false)
  fifo: boolean;

  // If this is true, then we'll pass the message as raw string to the handler.
  // Otherwise, we'll attempt to parse it. (default: false)
  payloadAsString: boolean;
};

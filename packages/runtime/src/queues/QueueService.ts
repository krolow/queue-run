// Runtime definition for a queue handler
export type QueueService = {
  // Filename of the module
  filename: string;
  // True if this is a FIFO queue
  isFifo: boolean;
  // The queue name (not fully qualified)
  queueName: string;
  // Timeout in seconds
  timeout: number;
};

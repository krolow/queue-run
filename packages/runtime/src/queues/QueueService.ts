// Runtime definition for a queue handler
export type QueueService = {
  // Accepted content types, eg application/json, text/*, */*
  accepts: Set<string>;
  // True if QueueRun should handle CORS
  cors: boolean;
  // Filename of the module
  filename: string;
  // True if this is a FIFO queue
  isFifo: boolean;
  // URL path if this queue is exposed as HTTP endpoint
  path: string | null;
  // The queue name (not fully qualified)
  queueName: string;
  // Timeout in seconds
  timeout: number;
};

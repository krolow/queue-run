import { JSONObject } from "./payload";

export declare type QueueHandler = (
  payload: JSONObject | string
) => Promise<void> | void;

export declare type QueueConfig = {
  // If this is true, then we'll create a FIFO queue. (default: false)
  fifo: boolean;

  // If this is true, then we'll pass the message as raw string to the handler.
  // Otherwise, we'll attempt to parse it. (default: false)
  payloadAsString: boolean;
};

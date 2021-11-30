import { JSONObject } from "./payload";

export declare type QueueHandler = (
  payload: JSONObject | string
) => Promise<void> | void;

export declare type QueueConfig = {
  fifo: boolean;
};

type JSONObject = { [key: string]: JSONValue };
type JSONArray = JSONValue[];
type JSONValue = string | number | boolean | null | JSONArray | JSONObject;

export declare type QueueHandler = (
  payload: JSONObject | string
) => Promise<void> | void;

export declare type QueueConfig = Record<string, unknown>;

export declare type TopicHandler = (
  payload: JSONObject | string
) => Promise<void> | void;

export declare type TopicConfig = Record<string, unknown>;

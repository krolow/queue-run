type JSONObject = { [key: string]: JSONValue };
type JSONArray = JSONValue[];
type JSONValue = string | number | boolean | null | JSONArray | JSONObject;

export declare type QueueHandler = (
  payload: JSONObject | string
) => Promise<void> | void;

export declare type QueueConfig = {
  // If true (default), expects message to be JSON and parse it before passing
  // to message handler.  If false, passes message as string.
  json?: boolean;
};

export declare type TopicHandler = (
  payload: JSONObject | string
) => Promise<void> | void;

export declare type TopicConfig = Record<string, unknown>;

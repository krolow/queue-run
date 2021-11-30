export declare type JSONObject = { [key: string]: JSONValue };
export declare type JSONArray = JSONValue[];
export declare type JSONValue =
  | string
  | number
  | boolean
  | null
  | JSONArray
  | JSONObject;

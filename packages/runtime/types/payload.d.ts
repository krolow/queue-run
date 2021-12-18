export type JSONObject = { [key: string]: JSONValue };
export type JSONArray = JSONValue[];
export type JSONValue =
  | string
  | number
  | boolean
  | null
  | JSONArray
  | JSONObject;

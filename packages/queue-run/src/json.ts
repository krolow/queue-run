export type JSONValue =
  | string
  | number
  | boolean
  | null
  | JSONObject
  | JSONValue[]
  | undefined;
export type JSONObject = { [key: string]: JSONValue };

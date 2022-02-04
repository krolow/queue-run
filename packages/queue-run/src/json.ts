/**
 * This type can represent any JSON value, including primitives, arrays, and objects.
 */
export type JSONValue =
  | string
  | number
  | boolean
  | null
  | WithToJSON
  | JSONObject
  | JSONValue[];

export type JSONObject = { [key: string]: JSONValue };

interface WithToJSON {
  toJSON(): Omit<JSONValue, "toJSON">;
}

/**
 * Use this to cast any type into a JSONValue.
 *
 * ```
 * type MyObject = {
 *   name: string;
 *   date: Date;
 *   error: Error;
 *   fn: () => void;
 * };
 *
 * type MyObjectSerialized = JSONify<MyObject>;
 * =>
 * {
 *   name: string;
 *   date: string; // toJSON
 *   error: {};
 *   fn: never;
 * }
 * ```
 */
export type JSONify<T> = T extends WithToJSON
  ? ReturnType<T["toJSON"]>
  : T extends Error
  ? {}
  : T extends Function
  ? never
  : T extends object
  ? { [K in keyof T]: JSONify<T[K]> }
  : T;

type JSONObject = { [key: string]: JSONValue | JSONValue[] };
type JSONValue = string | number | boolean | JSONObject;

export namespace Queue {
  export type Handler = (payload: JSONObject) => Promise<void> | void;
  export type Config = {};
  export type Module = { handler: Handler; config?: Config };
}

export namespace Topic {
  export type Handler = (payload: JSONObject) => Promise<void> | void;
  export type Config = {};
  export type Module = { handler: Handler; config?: Config };
}

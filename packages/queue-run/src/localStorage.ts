import { AsyncLocalStorage } from "async_hooks";

export type LocalStorage = {
  // eslint-disable-next-line no-unused-vars
  queueJob(message: {
    dedupeID?: string;
    groupID?: string;
    params?: { [key: string]: string | string[] };
    payload: string | Buffer | object;
    queueName: string;
    user?: { id: string };
  }): Promise<string>;

  // eslint-disable-next-line no-unused-vars
  sendWebSocketMessage(message: {
    body: string | Buffer | object;
    user: { id: string };
  }): Promise<void>;

  user?: { id: string } | null;

  urls: {
    http: string;
    ws: string;
  };
};

const symbol = Symbol.for("qr-local-storage");

// This is used internally to allow handlers to queue jobs, send WS messages, etc.
export function getLocalStorage(): AsyncLocalStorage<LocalStorage> {
  // @ts-ignore
  return (global[symbol] ||= new AsyncLocalStorage<LocalStorage>());
}

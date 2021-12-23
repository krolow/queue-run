import { AsyncLocalStorage } from "async_hooks";

export type LocalStorage = {
  // eslint-disable-next-line no-unused-vars
  pushMessage(message: {
    body: string | Buffer | object;
    dedupeId?: string;
    groupId?: string;
    queueName: string;
    params?: { [key: string]: string };
    user?: { id: string };
  }): Promise<string>;

  // eslint-disable-next-line no-unused-vars
  sendWebSocketMessage(message: {
    body: string | Buffer | object;
    user: { id: string };
  }): Promise<void>;

  // eslint-disable-next-line no-unused-vars
  setUser(user?: { id: string } | null): void;
};

const symbol = Symbol("queue-run");

// This is used internally to allow handlers to queue jobs, send WS messages, etc.
export function getLocalStorage(): AsyncLocalStorage<LocalStorage> {
  // @ts-ignore
  return (global[symbol] ||= new AsyncLocalStorage<LocalStorage>());
}

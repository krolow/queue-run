import { AsyncLocalStorage } from "async_hooks";

type LocalStorage = {
  /* eslint-disable no-unused-vars */
  pushMessage(message: {
    body: string | Buffer | object;
    dedupeId?: string;
    groupId?: string;
    queueName: string;
    params?: { [key: string]: string };
    user?: { id: string };
  }): Promise<string>;
};

const symbol = Symbol("queue-run");

export default function getLocalStorage(): AsyncLocalStorage<LocalStorage> {
  // @ts-ignore
  return (global[symbol] ||= new AsyncLocalStorage<LocalStorage>());
}

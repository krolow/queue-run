import { AsyncLocalStorage } from "async_hooks";

/* eslint-disable no-unused-vars */
export abstract class LocalStorage {
  public urls: { http: string; ws: string };

  private _user: { id: string; [key: string]: any } | null;
  private _userSet = false;

  constructor({ urls }: { urls: { http: string; ws: string } }) {
    this.urls = urls;
    this._user = null;
  }

  queueJob(message: {
    dedupeID?: string;
    groupID?: string;
    params?: { [key: string]: string | string[] };
    payload: string | Buffer | object;
    queueName: string;
    user?: { id: string };
  }): Promise<string> {
    throw new Error("Job queues not available in this environment.");
  }

  sendWebSocketMessage(message: {
    body: string | Buffer | object;
    user: { id: string };
  }): Promise<void> {
    throw new Error("WebSocket not available in this environment.");
  }

  get user(): { id: string; [key: string]: any } | null {
    return this._user;
  }

  set user(user: { id: string } | null | undefined) {
    if (this._userSet) throw new Error("Local context user already set");
    if (user && !user.id) throw new TypeError("User ID is required");
    this._user = user ?? null;
    this._userSet = true;
  }
}
/* eslint-enable no-unused-vars */

// This supposed to fail if you're using two different versions of queue-run.
// Let's see if this helps or not.
const symbol = Symbol("qr-local-storage");

// This is used internally to allow handlers to queue jobs, send WS messages, etc.
export function getLocalStorage(): LocalStorage {
  // @ts-ignore
  const asyncLocal = global[symbol];
  if (!asyncLocal) throw new Error("Runtime not available");
  return asyncLocal.getStore();
}

export function withLocalStorage<T>(
  localStorage: LocalStorage,
  fn: () => T
): T {
  // @ts-ignore
  const asyncLocal = (global[symbol] ||= new AsyncLocalStorage<LocalStorage>());
  if (asyncLocal.getStore()) throw new Error("Can't nest runtimes");
  return asyncLocal.run(localStorage, fn);
}

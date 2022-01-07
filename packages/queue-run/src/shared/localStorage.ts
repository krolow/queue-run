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
    dedupeID?: string | undefined;
    groupID?: string | undefined;
    params?: { [key: string]: string | string[] } | undefined;
    payload: string | Buffer | object;
    queueName: string;
    user?: { id: string } | null | undefined;
  }): Promise<string> {
    throw new Error("Job queues not available in this environment.");
  }

  onWebSocketAccepted({
    userID,
    socketID,
  }: {
    userID: string;
    socketID: string;
  }) {
    throw new Error("WebSocket not available in this environment.");
  }

  onWebSocketClosed(socketID: string) {}

  sendWebSocketMessage(params: {
    message: string | Buffer | object;
    userIDs: string[];
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

  // withLocalStorage will complain if you try to next contexts by mistake,
  // but if you need to break out (eg dev server does), use this method.
  exit(callback: () => unknown): void {
    asyncLocal.exit(callback);
  }
}
/* eslint-enable no-unused-vars */

const asyncLocal = new AsyncLocalStorage<LocalStorage>();

// This is used internally to allow handlers to queue jobs, send WS messages, etc.
export function getLocalStorage(): LocalStorage {
  const local = asyncLocal.getStore();
  if (!local) throw new Error("Runtime not available");
  return local;
}

export function withLocalStorage<T>(
  localStorage: LocalStorage,
  fn: () => T
): T {
  if (asyncLocal.getStore()) throw new Error("Can't nest runtimes");
  return asyncLocal.run(localStorage, fn);
}

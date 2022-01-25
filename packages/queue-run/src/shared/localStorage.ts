import { AsyncLocalStorage } from "node:async_hooks";
import { AuthenticatedUser } from "../shared/authenticated.js";

/* eslint-disable no-unused-vars */
/**
 * LocalStorage exists to allow methods like `queue.push` or `socket.send` to be
 * used anywhere in the code.
 *
 * When the app calls `socket.send`, we need a) access to the runtime to queue
 * the message, b) access to the current content to know the user ID.
 *
 * Each runtime implements LocalStorage, so it can provide the necessary methods.
 *
 * The request handler will set the user after authentication.
 */
export abstract class LocalStorage {
  public readonly urls: { http: string; ws: string };

  /**
   * String — Identified for authenicated user
   * null — Anonymous user
   * undefined — Not authenticated
   */
  public userId?: string | null | undefined;

  /** WebSocket connection ID */
  public connectionId: string | undefined;

  constructor({ urls }: { urls: { http: string; ws: string } }) {
    this.urls = urls;
  }

  queueJob(message: {
    dedupeId?: string | undefined;
    groupId?: string | undefined;
    params?: { [key: string]: string | string[] } | undefined;
    payload: string | Buffer | object;
    queueName: string;
    user?: { id: string } | null | undefined;
  }): Promise<string> {
    throw new Error("Job queues not available in this environment.");
  }

  sendWebSocketMessage(message: Buffer, connection: string): Promise<void> {
    // eslint-disable-next-line sonarjs/no-duplicate-string
    throw new Error("WebSocket not available in this environment.");
  }

  closeWebSocket(connection: string): Promise<void> {
    throw new Error("WebSocket not available in this environment.");
  }

  getConnections(userIds: string[]): Promise<string[]> {
    throw new Error("WebSocket not available in this environment.");
  }

  /**
   * Use this to set the current user **after** authentication, include to null.
   *
   * Set the user property, to associated the (previously) authenticated user.
   */
  async authenticated(user: AuthenticatedUser | null) {
    if (user && !user.id) throw new TypeError("User ID is required");
    this.userId = user?.id ?? null;
  }

  /**
   * `withLocalStorag` will complain if you try to nest contexts. If you need to
   * break out of the current context, use this method (eg dev server does this
   * when queuing a job)
   */
  exit(callback: () => unknown): void {
    asyncLocal.exit(callback);
  }
}
/* eslint-enable no-unused-vars */

const asyncLocal = new AsyncLocalStorage<LocalStorage>();

/**
 * @returns The current LocalStorage instance
 * @throws Not executed from within withLocalStorage
 */
export function getLocalStorage(): LocalStorage {
  const local = asyncLocal.getStore();
  if (!local) throw new Error("Runtime not available");
  return local;
}

/**
 * Execute function with the current LocalStorage instance.
 *
 * @param localStorage New LocalStorage instance
 * @param fn Function to execute
 * @returns Return value of the function
 */
export function withLocalStorage<T>(
  localStorage: LocalStorage,
  fn: () => T
): T {
  if (asyncLocal.getStore()) throw new Error("Can't nest runtimes");
  return asyncLocal.run(localStorage, fn);
}

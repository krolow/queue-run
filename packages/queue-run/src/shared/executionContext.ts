import { AsyncLocalStorage } from "node:async_hooks";
import { AuthenticatedUser } from "./authenticated.js";
import TimeoutError from "./TimeoutError.js";

/* eslint-disable no-unused-vars */
/**
 * Context for executing request handlers and middleware:
 * - Allows methods like `queue.push` and `socket.send` to exist
 * - Manages abort signal, aborts on timeout or completion
 */
export abstract class ExecutionContext {
  /**
   * object — Authenticated user
   * null — Anonymous user
   * undefined — Not authenticated yet
   */
  public user?: AuthenticatedUser | null | undefined;

  /** WebSocket connection ID */
  public connectionId: string | undefined;

  private controller: AbortController;
  private timer;
  private endTime: number;

  constructor({ timeout }: { timeout: number }) {
    this.controller = new AbortController();
    this.endTime = Date.now() + timeout * 1000;
    this.timer = setTimeout(() => this.controller.abort(), timeout * 1000);
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
  async authenticated(user: AuthenticatedUser | null): Promise<void> {
    if (typeof user === "string") return await this.authenticated({ id: user });
    if (typeof user !== "object")
      throw new TypeError("User must be an object or null");
    if (user && !user.id) throw new TypeError("User ID is required");
    this.user = user;
  }

  /**
   * `withExecutionContext` will complain if you try to nest contexts. If you need to
   * break out of the current context, use this method (eg dev server does this
   * when queuing a job)
   */
  exit(callback: () => unknown): void {
    asyncLocal.exit(callback);
  }

  /**
   * Time remaining in the current context. In milliseconds.
   */
  get remainingTime(): number {
    return Math.max(0, this.endTime - Date.now());
  }

  /**
   * This abort signal is raised when the handler completes or times out.
   */
  get signal(): AbortSignal {
    return this.controller.signal;
  }

  finalize() {
    this.controller.abort();
    clearTimeout(this.timer);
  }
}
/* eslint-enable no-unused-vars */

const asyncLocal = new AsyncLocalStorage<ExecutionContext>();

/**
 * @returns The current execution context
 * @throws Not inside an execution context
 */
export function getExecutionContext(): ExecutionContext {
  const local = asyncLocal.getStore();
  if (!local) throw new Error("Runtime not available");
  return local;
}

/**
 * Execute function with the new execution context.
 *
 * @param context New execution context
 * @param fn Function to execute
 * @returns Return value of the function
 */
export async function withExecutionContext<T>(
  context: ExecutionContext,
  // eslint-disable-next-line no-unused-vars
  fn: (context: ExecutionContext) => Promise<T> | T
): Promise<T> {
  if (asyncLocal.getStore()) throw new Error("Can't nest runtimes");
  try {
    return await Promise.race<T>([
      asyncLocal.run(context, () => fn(context)),
      new Promise((resolve, reject) =>
        context.signal.addEventListener("abort", () =>
          reject(new TimeoutError())
        )
      ),
    ]);
  } finally {
    // Clear timeout and abort controller
    context.finalize();
  }
}

/**
 * Function for creating a new execution context. Actual implementation depends
 * on the runtime.
 */
// eslint-disable-next-line no-unused-vars
export type NewExecutionContext = (args: {
  timeout: number;
}) => ExecutionContext;

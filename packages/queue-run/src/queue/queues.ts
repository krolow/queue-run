import { RequestHandler } from "../http/exports.js";
import { Response } from "../http/fetch.js";
import { getExecutionContext } from "../shared/execution_context.js";
import { loadManifest } from "../shared/manifest.js";
import selfPath from "../shared/self_path.js";

type Payload = Buffer | string | object;
type Params = { [key: string]: string | string[] };

/* eslint-disable no-unused-vars */
interface QueuesFunction<T extends Payload> {
  /**
   * Returns a reference to the named queue.
   *
   * You can type this queue with the payload type you want to use.
   *
   * ```
   * const queue = queues<{ id: string; amount: number }>('my-queue');
   * ```
   *
   * @param name The name of the queue
   * @returns A queue
   */
  (name: string): QueueFunction<T>;

  /**
   * Returns a reference to the named queue.
   *
   * @param name The name of the queue
   * @returns A queue
   */
  get: <T extends Payload>(name: string) => QueueFunction<T>;

  /**
   * Returns a reference to the current queue. You can only use this from a
   * queue handler.
   *
   * You can type this queue with the payload type you want to use.
   *
   * ```
   * const queue = queues.self<{ id: string; amount: number }>();
   * ```
   *
   * @returns A queue
   * @throws Called not from within nda queue handler
   */
  self: <T extends Payload>() => QueueFunction<T>;
}
/* eslint-enable no-unused-vars */

const queues: QueuesFunction<Payload> = (name) => newQueue(name);

queues.get = <T extends Payload>(name: string) => newQueue<T>(name);

queues.self = <T extends Payload>() => {
  const pathname = selfPath();
  if (!pathname.startsWith("queues/"))
    throw new Error("You can only use self from a queue handler");
  return queues.get<T>(pathname.slice(7));
};

export default queues;

/* eslint-disable no-unused-vars */
interface QueueFunction<T extends Payload> {
  /**
   * Push a job to the queue.
   *
   * @param payload Object, string, or Buffer. Empty payloads not allowed.
   * @returns The job ID
   * @throws If the queue doesn't exist, payload is empty, or FIFO queue and no
   * group ID set
   */
  (payload: T, params?: Params): Promise<string>;

  /**
   * Sets the deduplication ID.
   *
   * FIFO queues allow you to set the deduplication ID for the job.  If absent,
   * the deduplication ID is a hash of the payload.
   *
   * @param id The deduplication ID
   * @returns The queue with the deduplication ID set
   * @throws If this is not a FIFO queue
   */
  dedupe: (id: string) => QueueFunction<T>;

  /**
   * True if this is a FIFO queue.
   */
  fifo: boolean;

  /**
   * Sets the group ID.
   *
   * FIFO queues require this before queueing a job.
   *
   * ```
   * await queues('update.fifo').group(accountId).push(data);
   * ```
   *
   * @param id The group ID
   * @retun The queue with the group ID set
   * @throws If this is not a FIFO queue
   */
  group: (id: string) => QueueFunction<T>;

  /**
   * You can export a queue as an HTTP POST method.
   *
   * ```
   * export const post = queues('update').http;
   * ```
   */
  http: RequestHandler;

  /**
   * Push a job to the queue. Returns the job ID.
   *
   * Payload can be a string, object, or Buffer. Empty payloads are allowed.
   *
   * @param payload Object, string, or Buffer. Empty payloads not allowed.
   * @returns The job ID
   * @throws If the queue doesn't exist, payload is empty, or FIFO queue and no
   * group ID set
   */
  push(payload: T, params?: Params): Promise<string>;

  /**
   * The queue name.
   */
  queueName: string;
}
/* eslint-enable no-unused-vars */

// eslint-disable-next-line sonarjs/cognitive-complexity
function newQueue<T extends Payload>(
  queueName: string,
  group?: string,
  dedupe?: string
): QueueFunction<T> {
  if (!/^[a-zA-Z0-9_-]+(\.fifo)?$/.test(queueName))
    throw new Error("Invalid queue name");
  const fifo = queueName.endsWith(".fifo");

  const queueFn: QueueFunction<T> = async (payload, params) => {
    const local = getExecutionContext();

    const { queues } = await loadManifest();
    if (!queues.has(queueName))
      throw new Error(`No queue with the name "${queueName}"`);

    if (fifo && !group) throw new Error("FIFO queue requires a group ID");

    return await local.queueJob({
      dedupeId: dedupe,
      groupId: group,
      params: params ?? {},
      payload: payload as unknown as object,
      queueName,
      user: local.user ?? null,
    });
  };

  queueFn.http = async ({ body, params }) => {
    if (body === null)
      throw new Response("Unsupported media type", { status: 415 });
    if (
      (typeof body === "string" && body.length === 0) ||
      (Buffer.isBuffer(body) && body.byteLength === 0)
    )
      throw new Response("Empty body", { status: 422 });

    const fifo = queueName.endsWith(".fifo");
    if (fifo && !params.group)
      throw new Error("FIFO queue requires a group ID");

    const grouped = fifo ? queueFn.group(String(params.group)) : queueFn;
    const deduped =
      fifo && params.dedupe ? grouped.dedupe(String(params.dedupe)) : grouped;

    const jobId = await deduped.push(body as unknown as T, params);
    return new Response("Accepted", {
      headers: { "X-Job-Id": jobId },
      status: 202,
    });
  };

  queueFn.group = (id) => {
    if (fifo) return newQueue(queueName, id, dedupe);
    else throw new Error("Only FIFO queues support group ID");
  };

  queueFn.dedupe = (id) => {
    if (fifo) return newQueue(queueName, group, id);
    else throw new Error("Only FIFO queues support deduplication ID");
  };

  queueFn.toString = () => queueName;
  queueFn.valueOf = () => queueName;

  queueFn.queueName = queueName;
  queueFn.fifo = fifo;
  queueFn.push = queueFn;
  return queueFn;
}

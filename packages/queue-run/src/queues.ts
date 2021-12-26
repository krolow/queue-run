import { getLocalStorage } from "./localStorage";
import { AuthenticatedUser } from "./types/middleware";

// Use this function to create a queue object.
//
// For example:
//   import { queue } from "queue-run";
//
//   queue('my-queue').push('Hello, world!');
export function queue<Payload extends object | Buffer | string>(
  name: string
): QueueFunction<Payload> {
  return newQueue(name);
}

interface QueueFunction<Payload> {
  (payload: Payload): Promise<string>;

  // Returns a new queue object with this group ID. Required for FIFO queues.
  //
  // When using FIFO queues, messages are processed in order within the same
  // group.  To avoid processing delays, use the most specific group ID. For
  // example, if you're updating the user's account, use the user ID as the
  // group ID.
  group: (id: string) => QueueFunction<Payload>;

  // Returns a new queue object with this deduplication ID. Optional for FIFO queues.
  //
  // When using FIFO queues, duplicate messages are discarded.  If you don't set
  // a duplication ID, then two messages with the same content will be treated
  // as duplicates. For example, if you're processing a payment, you might want
  // to use the unique transaction ID as the duplication ID.
  dedupe: (id: string) => QueueFunction<Payload>;

  // True if this queue is FIFO.
  fifo: boolean;

  // Push a message to the queue. Returns the message id.
  //
  // The payload can be a string, a Buffer, or a JSON object.
  //
  // Objects are serialized to JSON, so for example, Date objects will
  // be converted to strings, undefined keys do not exist, and you can't have
  // circular references.
  push(payload: Payload | Request): Promise<string>;
}

// eslint-disable-next-line sonarjs/cognitive-complexity
function newQueue<Payload>(
  queueName: string,
  group?: string,
  dedupe?: string
): QueueFunction<Payload> {
  if (!/^[a-zA-Z0-9_-]+(\.fifo)?$/.test(queueName))
    throw new Error("Invalid queue name");
  const fifo = queueName.endsWith(".fifo");

  const push: QueueFunction<Payload> = async (
    payload: Payload | Request,
    metadata?: {
      params?: { [key: string]: any };
      user?: AuthenticatedUser;
    }
  ) => {
    const context = getLocalStorage().getStore();
    if (!context) throw new Error("Runtime not available");

    const groupId =
      (payload instanceof Request && metadata?.params?.group) ?? group;
    const dedupeId =
      (payload instanceof Request && metadata?.params?.dedupe) ?? dedupe;
    if (fifo && !groupId) throw new Error("FIFO queues require a group ID");

    return await context.pushMessage({
      body: payload as never,
      dedupeId,
      groupId,
      queueName,
      params: metadata?.params,
      user: metadata?.user ?? context.user ?? undefined,
    });
  };

  push.group = (id) => {
    if (fifo) return newQueue(queueName, id, dedupe);
    else throw new Error("Only FIFO queues support group ID");
  };

  push.dedupe = (id) => {
    if (fifo) return newQueue(queueName, group, id);
    else throw new Error("Only FIFO queues support deduplication ID");
  };

  push.fifo = fifo;
  push.push = push;
  return push;
}

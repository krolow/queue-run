import getLocalStorage from "./localStorage";

export class Queue<Payload> {
  private _group?: string;
  private _dedupe?: string;
  public name: string;

  constructor(name: string, group?: string, dedupe?: string) {
    if (!/^[a-zA-Z0-9_-](\.fifo)?$/.test(name))
      throw new Error("Invalid queue name");
    this.name = name;
    this._group = group;
    this._dedupe = dedupe;
  }

  // Returns a new queue object with this group ID. Required for FIFO queues.
  //
  // When using FIFO queues, messages are processed in order within the same
  // group.  To avoid processing delays, use the most specific group ID. For
  // example, if you're updating the user's account, use the user ID as the
  // group ID.
  group(id: string) {
    if (this.fifo) return new Queue(this.name, id, this._dedupe);
    else throw new Error("Only FIFO queues support group ID");
  }

  // Returns a new queue object with this deduplication ID. Optional for FIFO queues.
  //
  // When using FIFO queues, duplicate messages are discarded.  If you don't set
  // a duplication ID, then two messages with the same content will be treated
  // as duplicates. For example, if you're processing a payment, you might want
  // to use the unique transaction ID as the duplication ID.
  dedupe(id: string) {
    if (this.fifo) return new Queue(this.name, this._group, id);
    else throw new Error("Only FIFO queues support deduplication ID");
  }

  // True if this queue is FIFO.
  get fifo() {
    return this.name.endsWith(".fifo");
  }

  // Push a message to the queue. Returns the message id.
  //
  // The payload can be a string, a Buffer, or a JSON object.
  //
  // Objects are serialized to JSON, so for example, Date objects will
  // be converted to strings, undefined keys do not exist, and you can't have
  // circular references.
  async push(payload: Payload): Promise<string> {
    if (this.fifo && !this._group)
      throw new Error("FIFO queues require a group ID");

    const context = getLocalStorage().getStore();
    if (!context) throw new Error("Runtime not available");
    return await context.pushMessage({
      body: payload as unknown as object,
      dedupeId: this._dedupe,
      groupId: this._group,
      queueName: this.name,
    });
  }
}

// Use this function to create a queue object.
//
// For example:
//   import { queue } from "queue-run";
//
//   queue('my-queue').push('Hello, world!');
export function queue<Payload extends object | Buffer | string>(
  name: string
): Queue<Payload> {
  return new Queue<Payload>(name);
}

import { pushMessage } from ".";

interface Queue<Payload> {
  // The queue name
  name: string;
  // Set the group identifier. Returns a new Queue object.
  group: (id: string) => Queue<Payload>;
  // Set the dedupe identifier. Returns a new Queue object.
  dedupe: (id: string) => Queue<Payload>;
  // Push a message to the queue. Returns the message id.
  //
  // Queue handler will receive payload of the same type (Buffer, string, or
  // object).  Objects are serialized to JSON, so for example, Date objects will
  // be converted to strings, undefined keys do not exist, and you can't have
  // circular references.
  push: (payload: Payload) => Promise<string>;
}

function create<Payload>(
  name: string,
  group?: string,
  dedupe?: string
): Queue<Payload> {
  return {
    name,
    group: (id: string) => create(name, id, dedupe),
    dedupe: (id: string) => create(name, group, id),
    push: (payload: Payload) =>
      pushMessage({
        body: payload as unknown as string,
        queueName: name,
        groupId: group,
        dedupeId: dedupe,
      }),
  };
}

// Use this function to declare a queue
export function queue<T extends object | Buffer | string>(
  name: string
): Queue<T> {
  return create<T>(name);
}

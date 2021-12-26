import { URLSearchParams } from "url";
import { getLocalStorage } from "./localStorage";

type Payload = Request | Buffer | string | object;

// Use this function to create a queue object.
//
// For example:
//   import { queue } from "queue-run";
//
//   queue('my-queue').push('Hello, world!');
export function queue<T extends Payload>(name: string): QueueFunction<T> {
  return newQueue(name);
}

interface QueueFunction<T extends Payload> {
  // eslint-disable-next-line no-unused-vars
  (payload: T): Promise<string>;

  // Returns a new queue object with this group ID. Required for FIFO queues.
  //
  // When using FIFO queues, messages are processed in order within the same
  // group.  To avoid processing delays, use the most specific group ID. For
  // example, if you're updating the user's account, use the user ID as the
  // group ID.
  // eslint-disable-next-line no-unused-vars
  group: (id: string) => QueueFunction<T>;

  // Returns a new queue object with this deduplication ID. Optional for FIFO queues.
  //
  // When using FIFO queues, duplicate messages are discarded.  If you don't set
  // a duplication ID, then two messages with the same content will be treated
  // as duplicates. For example, if you're processing a payment, you might want
  // to use the unique transaction ID as the duplication ID.
  // eslint-disable-next-line no-unused-vars
  dedupe: (id: string) => QueueFunction<T>;

  // True if this queue is FIFO.
  fifo: boolean;

  // Push a message to the queue. Returns the message id.
  //
  // The payload can be a string, a Buffer, or a JSON object.
  //
  // Objects are serialized to JSON, so for example, Date objects will
  // be converted to strings, undefined keys do not exist, and you can't have
  // circular references.
  // eslint-disable-next-line no-unused-vars
  push(payload: T | Request): Promise<string>;
}

// eslint-disable-next-line sonarjs/cognitive-complexity
function newQueue<T extends Payload>(
  queueName: string,
  group?: string,
  dedupe?: string
): QueueFunction<T> {
  if (!/^[a-zA-Z0-9_-]+(\.fifo)?$/.test(queueName))
    throw new Error("Invalid queue name");
  const fifo = queueName.endsWith(".fifo");

  const push: QueueFunction<T> = async (
    payloadOrRequest: T,
    metadata?: {
      params?: { [key: string]: string | string[] };
      user?: { id: string };
    }
  ) => {
    const context = getLocalStorage().getStore();
    if (!context) throw new Error("Runtime not available");

    const groupID = metadata?.params?.group.toString() ?? group;
    const dedupeID = metadata?.params?.dedupe.toString() ?? dedupe;
    if (fifo && !groupID) throw new Error("FIFO queues require a group ID");

    return await context.queueJob({
      dedupeID,
      groupID,
      params: metadata?.params,
      payload: getPayload(payloadOrRequest),
      queueName,
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

async function getPayload(payloadOrRequest: Payload): Promise<object | string> {
  return payloadOrRequest instanceof Request
    ? await payloadFromRequest(payloadOrRequest)
    : payloadOrRequest;
}

async function payloadFromRequest(request: Request): Promise<object | string> {
  const contentType = request.headers.get("content-type");
  const mimeType = contentType?.split(";")[0];

  switch (mimeType) {
    case "application/json": {
      try {
        return await request.json();
      } catch (error) {
        throw new Response("application/json: not a valid JSON document", {
          status: 422,
        });
      }
    }

    case "application/octet-stream": {
      const buffer = await request.buffer();
      if (!buffer.byteLength)
        throw new Response("application/octet-stream: no message body", {
          status: 422,
        });
      return buffer;
    }

    case "application/x-www-form-urlencoded": {
      const text = await request.text();
      const params = new URLSearchParams(text);
      return Object.fromEntries(params.entries());
    }

    case "multipart/form-data": {
      try {
        return await formDataToObject(request);
      } catch (error) {
        throw new Response(String(error), { status: 422 });
      }
    }

    case "text/plain": {
      const text = await request.text();
      if (!text)
        throw new Response("text/plain: no message body", { status: 422 });
      return text;
    }

    default: {
      throw new Response("Unsupported media type", { status: 415 });
    }
  }
}

async function formDataToObject(request: Request) {
  const form = await request.form();
  return Array.from(form.entries()).reduce(
    (fields, [name, { contentType, data, filename }]) => {
      if (filename) throw new Error("multipart/form-data: files not supported");
      if (!name) throw new Error("multipart/form-data: part without name");
      const encoding = contentType?.match(/;\s*charset=([^;]+)/)?.[1];
      return {
        ...fields,
        // @ts-ignore
        [name]: data.toString(encoding ?? "utf-8"),
      };
    },
    {}
  );
}

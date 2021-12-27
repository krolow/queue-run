import { URLSearchParams } from "url";
import { getLocalStorage } from "./localStorage";

type Payload = Request | Buffer | string | object;
type Options = {
  params?: { [key: string]: string | string[] };
  user?: { id: string };
};

// Use this function to create a queue object.
//
// For example:
//   import { queues } from "queue-run";
//
//   await queues('my-queue').push('Hello, world!');
//
// With TypeScript you can also apply a type to the payload:
//   await queues<{ id: string }>('my-queue').push({ id: '123' });
export function queues<T extends Payload>(name: string): QueueFunction<T> {
  return newQueue(name);
}

// A function that can be used to push a job to a queue. Returns the job ID.
//
// You can push an object, Buffer, string, or HTTP Request.
//
// If you push an object, it will be serialized to JSON.  For example,
// Date objects will be converted to ISO 8601 strings, and you can't have
// circular references.
/* eslint-disable no-unused-vars */
interface QueueFunction<T extends Payload> {
  (payload: T, options?: Options): Promise<string>;

  // Returns a new queue function with this group ID. Required for FIFO queues.
  //
  // When using FIFO queues, messages are processed in order within the same
  // group.  To avoid processing delays, use the most specific group ID. For
  // example, if you're updating the user's account, use the user ID as the
  // group ID.
  group: (id: string) => QueueFunction<T>;

  // Returns a new queue function with this deduplication ID. Optional for FIFO queues.
  //
  // When using FIFO queues, duplicate messages are discarded.  If you don't set
  // a duplication ID, then two messages with the same content will be treated
  // as duplicates. For example, if you're processing a payment, you might want
  // to use the unique transaction ID as the duplication ID.
  dedupe: (id: string) => QueueFunction<T>;

  // True if this queue is FIFO.
  fifo: boolean;

  // The queue name.
  queueName: string;

  // Push a message to the queue. This is the same as the queue function,
  // available here for convenience.
  //
  // These two are the same:
  //   await queues('my-queue').push('Hello, world!');
  //   await queues('my-queue')('Hello, world!');
  push(payload: T, options?: Options): Promise<string>;
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

  const queueFn: QueueFunction<T> = async (payloadOrRequest, options) => {
    const context = getLocalStorage().getStore();
    if (!context) throw new Error("Runtime not available");

    const params = options?.params ?? {};
    const groupID = params.group.toString() ?? group;
    const dedupeID = params.dedupe.toString() ?? dedupe;
    if (fifo && !groupID) throw new Error("FIFO queues require a group ID");

    const payload = await getPayload(payloadOrRequest);

    const user = options?.user ?? context.user ?? undefined;

    return await context.queueJob({
      dedupeID,
      groupID,
      params,
      payload,
      queueName,
      user,
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

  queueFn.queueName = queueName;
  queueFn.fifo = fifo;
  queueFn.push = queueFn;
  return queueFn;
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

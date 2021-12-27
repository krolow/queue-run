import { URLSearchParams } from "url";
import { Request, RequestFormData, Response } from "./http/fetch";
import { getLocalStorage } from "./localStorage";
import loadQueues from "./queue/loadQueues";
import selfPath from "./selfPath";
import { RequestHandler } from "./types";

type Payload = Buffer | string | object;
type Params = { [key: string]: string | string[] };

// Use this function to create a queue object.
//
// For example:
//   import { queues } from "queue-run";
//
//   await queues('my-queue').push('Hello, world!');
//
// With TypeScript you can also apply a type to the payload:
//   await queues<{ id: string }>('my-queue').push({ id: '123' });
interface QueuesFunction<T extends Payload> {
  // eslint-disable-next-line no-unused-vars
  (name: string): QueueFunction<T>;

  // Returns the current queue. You can export this to a route handler.
  //
  // For example:
  //
  //   export const queue = queues.self;
  self: QueueFunction<T>;
}

const queues: QueuesFunction<Payload> = (name) => newQueue(name);

queues.self = newQueue("self");

Object.defineProperty(queues, "self", {
  get: () => {
    const pathname = selfPath();
    console.log(pathname);
    if (!pathname.startsWith("queues/"))
      throw new Error("You can only use self from a queue handler");
    return queues(pathname.slice(7));
  },
  enumerable: false,
});

export default queues;

// A function that can be used to push a job to a queue. Returns the job ID.
//
// You can push an object, Buffer, string.
//
// If you push an object, it will be serialized to JSON.  For example,
// Date objects will be converted to ISO 8601 strings, and you can't have
// circular references.
//
// You can also expose a queue as an HTTP endpoint.  For example:
//
//   export const post = queues('my-queue').http;
/* eslint-disable no-unused-vars */
interface QueueFunction<T = Payload> {
  (payload: T, params?: Params): Promise<string>;

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
  push(payload: T, params?: Params): Promise<string>;

  // Expose queue as an HTTP endpoint.
  //
  // For example:
  //   export const post = queues('my-queue').http;
  //   export config = { accepts: ["application/json"] };
  //
  // The queue can accept JSON documents and HTML forms (URL encoded and
  // multipart) Both are processed as objects. It can also accept text/plain,
  // processed as a string, and application/octet-stream, processed as a Buffer.
  //
  // The response is 202 Accepted, with a header X-Job-ID containing the job ID.
  http: RequestHandler;
}
/* eslint-enable no-unused-vars */

// eslint-disable-next-line sonarjs/cognitive-complexity
function newQueue<T = Payload>(
  queueName: string,
  group?: string,
  dedupe?: string
): QueueFunction<T> {
  if (!/^[a-zA-Z0-9_-]+(\.fifo)?$/.test(queueName))
    throw new Error("Invalid queue name");
  const fifo = queueName.endsWith(".fifo");

  const queueFn: QueueFunction<T> = async (payload, params) => {
    const context = getLocalStorage().getStore();
    if (!context) throw new Error("Runtime not available");

    const queues = await loadQueues();
    if (!queues.has(queueName))
      throw new Error(`No queue with the name "${queueName}"`);

    if (fifo && !group) throw new Error("FIFO queue requires a group ID");

    return await context.queueJob({
      dedupeID: dedupe,
      groupID: group,
      params,
      payload: payload as unknown as object,
      queueName,
      user: context.user ?? undefined,
    });
  };

  queueFn.http = async (request, { params }) => {
    const payload = await payloadFromRequest(request);
    const fifo = queueName.endsWith(".fifo");
    if (fifo && !params.group)
      throw new Error("FIFO queue requires a group ID");

    const grouped = fifo ? queueFn.group(String(params.group)) : queueFn;
    const deduped =
      fifo && params.dedupe ? grouped.dedupe(String(params.dedupe)) : grouped;

    const jobID = await deduped.push(payload as unknown as T, params);
    return new Response("Accepted", {
      headers: { "X-Job-ID": jobID },
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

  queueFn.queueName = queueName;
  queueFn.fifo = fifo;
  queueFn.push = queueFn;
  return queueFn;
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

async function formDataToObject(
  request: Request
): Promise<{ [key: string]: string }> {
  const form = await RequestFormData.from(request);
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

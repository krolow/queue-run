import { URLSearchParams } from "url";
import { form, Request, RequestHandler, Response } from "../http/index.js";
import { getLocalStorage, loadManifest, selfPath } from "../shared/index.js";

type Payload = Buffer | string | object;
type Params = { [key: string]: string | string[] };

/* eslint-disable no-unused-vars */
interface QueuesFunction<T = Payload> {
  (name: string): QueueFunction<T>;
  get: <T>(name: string) => QueueFunction<T>;
  self: <T>() => QueueFunction<T>;
}
/* eslint-enable no-unused-vars */

const queues: QueuesFunction = (name) => newQueue(name);

queues.get = <T>(name: string) => newQueue<T>(name);

queues.self = <T>() => {
  const pathname = selfPath();
  if (!pathname.startsWith("queues/"))
    throw new Error("You can only use self from a queue handler");
  return queues.get<T>(pathname.slice(7));
};

export default queues;

/* eslint-disable no-unused-vars */
interface QueueFunction<T = Payload> {
  (payload: T, params?: Params): Promise<string>;
  dedupe: (id: string) => QueueFunction<T>;
  fifo: boolean;
  group: (id: string) => QueueFunction<T>;
  http: RequestHandler;
  push(payload: T, params?: Params): Promise<string>;
  queueName: string;
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
    const local = getLocalStorage();

    const { queues } = await loadManifest();
    if (!queues.has(queueName))
      throw new Error(`No queue with the name "${queueName}"`);

    if (fifo && !group) throw new Error("FIFO queue requires a group ID");

    return await local.queueJob({
      dedupeID: dedupe,
      groupID: group,
      params: params ?? {},
      payload: payload as unknown as object,
      queueName,
      user: local.user ?? undefined,
    });
  };

  queueFn.http = async ({ request, params }) => {
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

  queueFn.toString = () => queueName;
  queueFn.valueOf = () => queueName;

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
        return (await request.json()) as object;
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
        const fields = await form(request);
        if (
          Object.values(fields)
            .flat()
            .some((field) => typeof field !== "string" && "name" in field)
        )
          throw new Error("multipart/form-data: files not supported");
        return fields;
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

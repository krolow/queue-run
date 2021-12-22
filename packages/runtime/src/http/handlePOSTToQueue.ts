import invariant from "tiny-invariant";
import { URLSearchParams } from "url";
import { RequestHandler } from "../handlers";
import { HTTPRoute } from "../Route";

export default async function handlePOSTToQueue(
  route: HTTPRoute,
  request: Request,
  { params, user }: Parameters<RequestHandler>[1]
) {
  invariant(route.queue, "Route must have a queue");
  const { isFifo, queueName } = route.queue;
  if (isFifo && !params.group)
    throw new Response("Missing group parameter", { status: 400 });

  await global.$queueRun.pushMessage({
    body: await getMessageBody(request),
    ...(isFifo
      ? { dedupeId: params.dedupe, groupId: params.group }
      : undefined),
    queueName: queueName,
    params,
    user,
  });
  return new Response("Accepted", { status: 202 });
}

async function getMessageBody(
  request: Request
): Promise<Buffer | string | object> {
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

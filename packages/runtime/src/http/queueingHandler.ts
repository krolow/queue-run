import { Request, Response } from "node-fetch";
import multipart from "parse-multipart-data";
import invariant from "tiny-invariant";
import { URLSearchParams } from "url";
import "../globals";
import { RequestHandler } from "../handlers";
import { Route } from "../loadServices";

export default async function queueingHandler(
  route: Route,
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
          status: 400,
        });
      return buffer;
    }

    case "application/x-www-form-urlencoded": {
      const text = await request.text();
      const params = new URLSearchParams(text);
      return Object.fromEntries(params.entries());
    }

    case "multipart/form-data": {
      const boundary = contentType?.match(/;\s*boundary=([^;]+)/)?.[1];
      if (!boundary)
        throw new Response("multipart/form-data: missing boundary", {
          status: 422,
        });
      const inputParts = multipart.parse(await request.buffer(), boundary);
      return inputParts.reduce((parts, part) => {
        if (part.filename)
          throw new Response("multipart/form-data: files not supported", {
            status: 422,
          });
        if (!part.name)
          throw new Response("multipart/form-data: missing part name", {
            status: 422,
          });
        return { ...parts, [part.name]: part.data.toString() };
      }, {} as Record<string, string>);
    }

    case "text/plain": {
      const text = await request.text();
      if (!text)
        throw new Response("text/plain: no message body", { status: 400 });
      return text;
    }

    default: {
      throw new Response("Unsupported media type", { status: 415 });
    }
  }
}

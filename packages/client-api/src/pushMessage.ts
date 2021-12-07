import { SQS } from "@aws-sdk/client-sqs";
import { Request, Response } from "node-fetch";
import { URL } from "url";

const sqs = new SQS({});

export default async function pushMessage({
  branch,
  projectId,
  request,
}: {
  branch: string;
  projectId: string;
  request: Request;
}): Promise<Response> {
  const queueURL = await getQueueURL({ branch, projectId, request });
  const contentType = request.headers.get("Content-Type");
  const { MessageId: messageId } = await sqs.sendMessage({
    QueueUrl: queueURL,
    MessageBody: await request.text(),
    MessageAttributes: {
      ...(contentType && {
        "Content-Type": { DataType: "String", StringValue: contentType },
      }),
    },
    MessageGroupId: request.headers.get("X-Message-Group-Id") ?? undefined,
    MessageDeduplicationId:
      request.headers.get("X-Message-Deduplication-Id") ?? undefined,
  });
  return new Response(JSON.stringify({ messageId }));
}

async function getQueueURL({
  branch,
  projectId,
  request,
}: {
  branch: string;
  projectId: string;
  request: Request;
}): Promise<string> {
  const { pathname } = new URL(request.url);
  const [name, ...rest] = pathname.split("/").slice(2);
  if (!name) throw new Response("Queue not found", { status: 404 });
  if (rest.length > 0)
    throw new Response("Resource not found", { status: 404 });

  const queueName = `${projectId}-${branch}__${name}`;
  const { QueueUrl } = await sqs.getQueueUrl({ QueueName: queueName });
  if (!QueueUrl) throw new Response("Queue not found", { status: 404 });
  return QueueUrl;
}

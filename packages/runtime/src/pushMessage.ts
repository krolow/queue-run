import { SQS } from "@aws-sdk/client-sqs";
import { Request, Response } from "node-fetch";
import { URL } from "node:url";
import invariant from "tiny-invariant";
import loadMiddleware from "./loadMiddleware";
import loadModule from "./loadModule";

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
  const queueName = getQueueName(request);
  const module = await loadModule(`queue/${queueName}`);
  if (!module) throw new Response("Not Found", { status: 404 });

  const { authenticate } = await loadMiddleware(request);
  const user = authenticate && (await authenticate({ queueName, request }));

  const queueURL = await getQueueURL({ branch, projectId, request });
  const contentType = request.headers.get("Content-Type");
  const body = await request.text();
  if (!body) throw new Response("Missing message body", { status: 400 });

  const { MessageId: messageId } = await sqs.sendMessage({
    QueueUrl: queueURL,
    MessageBody: body,
    MessageAttributes: {
      ...(contentType && {
        "Content-Type": { DataType: "String", StringValue: contentType },
      }),
      ...(user && { userId: { DataType: "String", StringValue: user.id } }),
    },
    MessageGroupId: request.headers.get("X-Message-Group-Id") ?? undefined,
    MessageDeduplicationId:
      request.headers.get("X-Message-Deduplication-Id") ?? undefined,
  });
  return new Response(JSON.stringify({ messageId }));
}

function getQueueName(request: Request) {
  const { pathname } = new URL(request.url);
  const [name, ...rest] = pathname.split("/").slice(2);
  if (!name || rest.length > 0)
    throw new Response("Not Found", { status: 404 });
  return name;
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
  if (!name || rest.length > 0)
    throw new Response("Not Found", { status: 404 });

  const queueName = `${projectId}-${branch}__${name}`;
  try {
    const { QueueUrl } = await sqs.getQueueUrl({ QueueName: queueName });
    invariant(QueueUrl);
    return QueueUrl;
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === "AWS.SimpleQueueService.NonExistentQueue"
    )
      throw new Response("Queue not found", { status: 404 });
    else throw error;
  }
}

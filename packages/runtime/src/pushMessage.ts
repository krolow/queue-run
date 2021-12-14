import { SQS } from "@aws-sdk/client-sqs";
import { Request, Response } from "node-fetch";
import { URL } from "node:url";
import invariant from "tiny-invariant";
import loadMiddleware from "./loadMiddleware";
import loadModule from "./loadModule";

export default async function pushMessage({
  branch,
  projectId,
  request,
  sqs,
}: {
  branch: string;
  projectId: string;
  request: Request;
  sqs: SQS;
}): Promise<Response> {
  if (request.method !== "POST")
    throw new Response("Method Not Allowed", { status: 405 });

  const { queueName, groupId, dedupeId } = getQueueProperties(request);

  const queueURL = await getQueueURL({ branch, projectId, request, sqs });
  const module = await loadModule(`queue/${queueName}`);
  if (!module) {
    console.error("No module for queue", queueName);
    throw new Response("Not Found", { status: 404 });
  }

  const { authenticate } = await loadMiddleware(request);
  const user = authenticate && (await authenticate({ queueName, request }));

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
    MessageGroupId: groupId,
    MessageDeduplicationId: dedupeId,
  });
  return new Response(JSON.stringify({ messageId }));
}

// Get queue properties from the request.
//
// For regular queue, that means the queue name ("/queue/$queueName")
//
// For FIFO quque, also the group ID ("/queue/$queueName/$groupId") and optional
// dedupe ID ("/queue/$queueName/$groupId/$dedupeId")
function getQueueProperties(request: Request): {
  queueName: string;
  groupId?: string;
  dedupeId?: string;
} {
  const { pathname } = new URL(request.url);
  const [queueName, ...rest] = pathname.split("/").slice(2);
  if (!queueName) throw new Response("Not Found", { status: 404 });
  if (queueName.endsWith(".fifo")) {
    if (rest.length < 1)
      throw new Response("FIFO queue missing group ID", { status: 404 });
    if (rest.length > 2) throw new Response("Not Found", { status: 404 });
    const [groupId, dedupeId] = rest;
    return { queueName, groupId, dedupeId };
  } else {
    if (rest.length > 0) throw new Response("Not Found", { status: 404 });
    return { queueName };
  }
}

// Get the queue URL, and throw Response if queue doesn't exist.
async function getQueueURL({
  branch,
  projectId,
  request,
  sqs,
}: {
  branch: string;
  projectId: string;
  request: Request;
  sqs: SQS;
}): Promise<string> {
  const { pathname } = new URL(request.url);
  const name = pathname.split("/")[2];

  const queueName = `${projectId}-${branch}__${name}`;
  try {
    const { QueueUrl } = await sqs.getQueueUrl({ QueueName: queueName });
    invariant(QueueUrl);
    return QueueUrl;
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === "AWS.SimpleQueueService.NonExistentQueue"
    ) {
      console.error("No access to queue", queueName);
      throw new Response("Queue not found", { status: 404 });
    } else throw error;
  }
}

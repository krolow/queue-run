import { SendMessageCommandInput, SQS } from "@aws-sdk/client-sqs";
import crypto from "crypto";
import { Request, Response } from "node-fetch";
import invariant from "tiny-invariant";
import { URL } from "url";
import handleSQSMessages, { SQSMessage } from "./handleSQSMessages";
import loadModule from "./loadModule";

export default async function pushMessage({
  branch,
  getRemainingTimeInMillis,
  projectId,
  request,
  sqs,
}: {
  branch: string;
  getRemainingTimeInMillis: () => number;
  projectId: string;
  request: Request;
  sqs: SQS;
}): Promise<Response> {
  if (request.method !== "POST")
    throw new Response("Method Not Allowed", { status: 405 });

  const { queueName, groupId, dedupeId } = getQueueProperties(request);

  const queueURL = await getQueueURL({ branch, projectId, request, sqs });

  const module = await loadModule(`queues/${queueName}`);
  if (!module) {
    console.error("No module for queue", queueName);
    throw new Response("Not Found", { status: 404 });
  }

  let user;
  if (module.authenticate) {
    user = await module.authenticate(request);
    if (!(user && user.id)) {
      console.error(
        "Authenticate method returns invalid user: %d",
        user ? "no id" : user
      );
      throw new Response("Forbidden", { status: 403 });
    }
  }

  if (module.onRequest) await module.onRequest(request);

  const contentType = request.headers.get("Content-Type");
  const body = await request.text();
  if (!body) throw new Response("Missing message body", { status: 400 });

  const message: SendMessageCommandInput = {
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
  };

  const messageId =
    (await sqs.config.region()) === "localhost"
      ? await sendMessageInDev({ getRemainingTimeInMillis, message, sqs })
      : (await sqs.sendMessage(message)).MessageId;
  return new Response(JSON.stringify({ messageId }));
}

async function sendMessageInDev({
  getRemainingTimeInMillis,
  message,
  sqs,
}: {
  getRemainingTimeInMillis: () => number;
  message: SendMessageCommandInput;
  sqs: SQS;
}) {
  invariant(message.MessageBody);
  invariant(message.QueueUrl);
  invariant(message.MessageAttributes);
  const queueName = message.QueueUrl.split("/").pop();
  const messageId = crypto.randomBytes(8).toString("hex");
  const timestamp = Date.now().toString();
  const messages: SQSMessage[] = [
    {
      messageId,
      body: message.MessageBody,
      attributes: {
        MessageGroupId: message.MessageGroupId,
        MessageDeduplicationId: message.MessageDeduplicationId,
        ApproximateFirstReceiveTimestamp: timestamp,
        ApproximateReceiveCount: "1",
        SentTimestamp: timestamp,
        SequenceNumber: "1",
        SenderId: "sender",
      },
      messageAttributes: Object.fromEntries(
        Object.entries(message.MessageAttributes).map(([key, value]) => [
          key,
          { stringValue: value.StringValue! },
        ])
      ),
      receiptHandle: crypto.randomBytes(8).toString("hex"),
      eventSourceARN: `arn:aws:sqs:localhost:12345:${queueName}`,
      awsRegion: "localhost",
      eventSource: "aws:sqs",
      md5OfBody: crypto
        .createHash("md5")
        .update(message.MessageBody)
        .digest("hex"),
    },
  ];

  setTimeout(() =>
    handleSQSMessages({ getRemainingTimeInMillis, sqs, messages })
  );
  return { messageId };
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
  if ((await sqs.config.region()) === "localhost")
    return `http://localhost/queue/${queueName}`;

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

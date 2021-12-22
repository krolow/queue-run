import { SendMessageCommandInput, SQS } from "@aws-sdk/client-sqs";
import crypto from "crypto";
import type { AuthenticatedUser } from "queue-run";
import invariant from "tiny-invariant";
import { URLSearchParams } from "url";
import handleSQSMessages from "./handleSQSMessages";
import type { SQSMessage } from "./index";

export default async function pushMessage({
  body,
  dedupeId,
  groupId,
  params,
  queueName,
  slug,
  sqs,
  user,
}: {
  body: Buffer | string | object;
  dedupeId?: string;
  groupId?: string;
  params?: { [key: string]: string };
  queueName: string;
  slug: string;
  sqs: SQS;
  user?: AuthenticatedUser;
}): Promise<string> {
  const isDevServer = (await sqs.config.region()) === "localhost";

  const queueURL = isDevServer
    ? `http://localhost/queue/${slug}__${queueName}`
    : await getQueueURL({ queueName, slug, sqs });

  const contentType = Buffer.isBuffer(body)
    ? "application/octet-stream"
    : typeof body === "string"
    ? "text/plain"
    : "application/json";
  const messageBody = Buffer.isBuffer(body)
    ? body.toString("base64")
    : typeof body === "string"
    ? body
    : JSON.stringify(body);

  const message: SendMessageCommandInput = {
    QueueUrl: queueURL,
    MessageBody: messageBody,
    MessageAttributes: {
      "Content-Type": { DataType: "String", StringValue: contentType },
      params: {
        DataType: "String",
        StringValue: new URLSearchParams(params).toString(),
      },
      ...(user && { userId: { DataType: "String", StringValue: user.id } }),
    },
    MessageGroupId: groupId,
    MessageDeduplicationId: dedupeId,
  };

  if (isDevServer) {
    return await sendMessageInDev({ message, sqs });
  } else {
    const { MessageId: messageId } = await sqs.sendMessage(message);
    invariant(messageId);
    return messageId;
  }
}

async function sendMessageInDev({
  message,
  sqs,
}: {
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

  const endTime = Date.now() + 30 * 1000;
  const getRemainingTimeInMillis = () => Math.max(0, endTime - Date.now());

  setTimeout(() =>
    handleSQSMessages({ getRemainingTimeInMillis, sqs, messages })
  );
  return messageId;
}

// Get the queue URL, and throw Response if queue doesn't exist.
async function getQueueURL({
  queueName,
  slug,
  sqs,
}: {
  queueName: string;
  slug: string;
  sqs: SQS;
}): Promise<string> {
  const qualified = `${slug}__${queueName}`;
  try {
    const { QueueUrl } = await sqs.getQueueUrl({ QueueName: qualified });
    invariant(QueueUrl);
    return QueueUrl;
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === "AWS.SimpleQueueService.NonExistentQueue"
    ) {
      console.error("No access to queue", qualified);
      throw new Error("No access to queue");
    } else throw error;
  }
}

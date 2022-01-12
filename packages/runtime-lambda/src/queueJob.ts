import { SendMessageCommandInput, SQS } from "@aws-sdk/client-sqs";
import type { AuthenticatedUser } from "queue-run";
import invariant from "tiny-invariant";
import { URLSearchParams } from "url";

export default async function queueJob({
  payload,
  dedupeId,
  groupId,
  params,
  queueName,
  slug,
  sqs,
  user,
}: {
  payload: Buffer | string | object;
  dedupeId: string | undefined;
  groupId: string | undefined;
  params: { [key: string]: string | string[] } | undefined;
  queueName: string;
  slug: string;
  sqs: SQS;
  user?: AuthenticatedUser | null;
}): Promise<string> {
  const queueURL = await getQueueURL({ queueName, slug, sqs });

  const contentType = Buffer.isBuffer(payload)
    ? "application/octet-stream"
    : typeof payload === "string"
    ? "text/plain"
    : "application/json";
  const serializedBody = Buffer.isBuffer(payload)
    ? payload.toString("base64")
    : typeof payload === "string"
    ? payload
    : JSON.stringify(payload);

  const serializedParams = new URLSearchParams(params).toString();
  const serializedUserId = user?.id ? String(user.id) : undefined;

  const message: SendMessageCommandInput = {
    QueueUrl: queueURL,
    MessageBody: serializedBody,
    MessageAttributes: {
      "Content-Type": { DataType: "String", StringValue: contentType },
      // SQS complains if the attribute value is an empty string,
      // so we need to serialize the value and check for truthiness.
      ...(serializedParams
        ? { params: { DataType: "String", StringValue: serializedParams } }
        : undefined),
      ...(serializedUserId
        ? { userId: { DataType: "String", StringValue: serializedUserId } }
        : undefined),
    },
    ...(groupId ? { MessageGroupId: groupId } : undefined),
    ...(dedupeId ? { MessageDeduplicationId: dedupeId } : undefined),
  };

  const { MessageId: messageId } = await sqs.sendMessage(message);
  invariant(messageId);
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

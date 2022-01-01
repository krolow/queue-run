import { SendMessageCommandInput, SQS } from "@aws-sdk/client-sqs";
import type { AuthenticatedUser } from "queue-run";
import invariant from "tiny-invariant";
import { URLSearchParams } from "url";

export default async function queueJob({
  payload,
  dedupeID,
  groupID,
  params,
  queueName,
  slug,
  sqs,
  user,
}: {
  payload: Buffer | string | object;
  dedupeID: string | undefined;
  groupID: string | undefined;
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
  const messageBody = Buffer.isBuffer(payload)
    ? payload.toString("base64")
    : typeof payload === "string"
    ? payload
    : JSON.stringify(payload);

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
    ...(groupID && { MessageGroupId: groupID }),
    ...(dedupeID && { MessageDeduplicationId: dedupeID }),
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

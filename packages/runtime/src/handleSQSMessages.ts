import { SQS } from "@aws-sdk/client-sqs";
import { AbortController } from "node-abort-controller";
import type { JSONObject, QueueConfig, QueueHandler } from "../types";
import loadModule from "./loadModule";

const minTimeout = 1;
const maxTimeout = 30;
const defaultTimeout = 10;

export declare type SQSMessage = {
  attributes: {
    ApproximateFirstReceiveTimestamp: string;
    ApproximateReceiveCount: string;
    MessageDeduplicationId?: string;
    MessageGroupId?: string;
    SenderId: string;
    SentTimestamp: string;
    SequenceNumber?: string;
  };
  awsRegion: string;
  body: string;
  eventSource: "aws:sqs";
  eventSourceARN: string;
  md5OfBody: string;
  messageAttributes: {
    [key: string]: {
      stringValue: string;
    };
  };
  messageId: string;
  receiptHandle: string;
};

export default async function handleSQSMessages({
  getRemainingTimeInMillis,
  sqs,
  messages,
}: {
  getRemainingTimeInMillis: () => number;
  sqs: SQS;
  messages: SQSMessage[];
}): Promise<{
  // https://docs.aws.amazon.com/lambda/latest/dg/with-ddb.html#services-ddb-batchfailurereporting
  batchItemFailures: Array<{ itemIdentifier: string }>;
}> {
  return isFifoQueue(messages[0])
    ? await handleFifoMessages({ getRemainingTimeInMillis, messages, sqs })
    : await handleStandardMessages({ getRemainingTimeInMillis, messages, sqs });
}

// We follow the convention that FIFO queues end with .fifo.
function isFifoQueue(message: SQSMessage): boolean {
  return getQueueName(message).endsWith(".fifo");
}

// Standard queue: we can process the batch of messages in an order.
// Returns IDs of messages that failed to process.
async function handleStandardMessages({
  getRemainingTimeInMillis,
  messages,
  sqs,
}: {
  getRemainingTimeInMillis: () => number;
  messages: SQSMessage[];
  sqs: SQS;
}) {
  const failedMessageIds = await Promise.all(
    messages.map(async (message) =>
      (await handleOneMessage({ getRemainingTimeInMillis, message, sqs }))
        ? null
        : message.messageId
    )
  );
  return {
    batchItemFailures: failedMessageIds
      .filter(Boolean)
      .map((id) => ({ itemIdentifier: id! })),
  };
}

// FIFO queue: we get a batch of message from the same group.
// Process messages in order, fail on the first message that fails, and
// return that and all subsequent message IDs.
async function handleFifoMessages({
  getRemainingTimeInMillis,
  messages,
  sqs,
}: {
  getRemainingTimeInMillis: () => number;
  messages: SQSMessage[];
  sqs: SQS;
}) {
  let message;
  while ((message = messages.shift())) {
    const successful = await handleOneMessage({
      getRemainingTimeInMillis,
      message,
      sqs,
    });
    if (!successful) {
      return {
        batchItemFailures: [message]
          .concat(messages)
          .map((message) => ({ itemIdentifier: message.messageId })),
      };
    }
  }
  return { batchItemFailures: [] };
}

async function handleOneMessage({
  getRemainingTimeInMillis,
  message,
  sqs,
}: {
  getRemainingTimeInMillis: () => number;
  message: SQSMessage;
  sqs: SQS;
}): Promise<boolean> {
  const { messageId } = message;
  const queueName = getQueueName(message);
  const module = await loadModule<QueueHandler, QueueConfig>(
    `queues/${queueName}`
  );
  if (!module) throw new Error(`No handler for queue ${queueName}`);

  // When handling FIFO messges, possible we'll run out of time.
  const timeout = Math.min(
    getTimeout(module.config),
    getRemainingTimeInMillis()
  );
  if (timeout <= 0) return false;

  // Create an abort controller to allow the handler to cancel incomplete work.
  const controller = new AbortController();
  const abortTimeout = setTimeout(() => controller.abort(), timeout * 1000);

  const metadata = { ...getMetadata(message), signal: controller.signal };
  try {
    console.info("Handling message %s on queue %s", messageId, queueName);
    const payload = getPayload(message);

    await Promise.race([
      module.handler(payload, metadata),

      new Promise((resolve) => {
        controller.signal.addEventListener("abort", resolve);
      }),
    ]);

    if (controller.signal.aborted) {
      throw new Error(
        `Timeout: message took longer than ${timeout} to process`
      );
    } else controller.abort();

    console.info("Deleting message %s from queue %s", messageId, queueName);
    if ((await sqs.config.region()) !== "localhost") {
      await sqs.deleteMessage({
        QueueUrl: getQueueURL(message),
        ReceiptHandle: message.receiptHandle,
      });
    }
    return true;
  } catch (error) {
    console.error(
      "Error with message %s on queue %s",
      messageId,
      queueName,
      error
    );

    if (module.onError) {
      try {
        await module.onError(
          error instanceof Error ? error : new Error(String(error)),
          metadata
        );
      } catch (error) {
        console.error(
          "Error in onError handler for queue %s",
          queueName,
          error
        );
      }
    }

    return false;
  } finally {
    clearTimeout(abortTimeout);
  }
}

// Gets the full queue URL from the ARN.  API needs the URL, not ARN.
function getQueueURL(message: SQSMessage) {
  // Looks like "arn:aws:sqs:us-east-2:123456789012:project-branch__queue"
  const [region, accountId, queueName] = message.eventSourceARN
    .match(/arn:aws:sqs:(.*):(.*):(.*)$/)!
    .slice(1);
  return `https://sqs.${region}.amazonaws.com/${accountId}/${queueName}`;
}

// Gets the short queue name from the ARN.  Used for logging.
function getQueueName(message: SQSMessage) {
  // Looks like "arn:aws:sqs:us-east-2:123456789012:project-branch__queue"
  const qualifiedName = message.eventSourceARN.split(":").pop();
  const queueName = qualifiedName?.match(/^.*?__(.*)$/)?.[1];
  if (!queueName)
    throw new Error(`Could not parse queue name from ${qualifiedName}`);
  return queueName;
}

// Gets the payload from the message.  We rely on the content type, otherwise
// guess by trying to parse as JSON.
function getPayload(message: SQSMessage): JSONObject | string {
  const type = message.messageAttributes["type"]?.stringValue;
  if (type === "application/json") return JSON.parse(message.body);
  if (type) return message.body;
  try {
    return JSON.parse(message.body);
  } catch {
    return message.body;
  }
}

function getMetadata(
  message: SQSMessage
): Omit<Parameters<QueueHandler>[1], "signal"> {
  const { attributes } = message;
  return {
    messageID: message.messageId,
    groupID: attributes.MessageGroupId,
    queueName: getQueueName(message),
    receivedCount: +attributes.ApproximateReceiveCount,
    sentAt: new Date(+attributes.SentTimestamp),
    sequenceNumber: attributes.SequenceNumber
      ? +attributes.SequenceNumber
      : undefined,
  };
}

// Timeout in seconds.
function getTimeout(config?: QueueConfig): number {
  return Math.min(
    Math.max(config?.timeout ?? defaultTimeout, minTimeout),
    maxTimeout
  );
}

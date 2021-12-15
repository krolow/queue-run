import { SQS } from "@aws-sdk/client-sqs";
import { AbortController } from "node-abort-controller";
import invariant from "tiny-invariant";
import type { JSONObject, QueueConfig, QueueHandler } from "../types";
import type { SQSFifoMessage, SQSMessage } from "./index";
import loadModule from "./loadModule";

const minTimeout = 1;
const maxTimeout = 30;
const defaultTimeout = 10;

export default async function handleSQSMessages({
  sqs,
  messages,
}: {
  sqs: SQS;
  messages: SQSMessage[];
}): Promise<{
  // https://docs.aws.amazon.com/lambda/latest/dg/with-ddb.html#services-ddb-batchfailurereporting
  batchItemFailures: Array<{ itemIdentifier: string }>;
}> {
  return isFifoQueue(messages[0])
    ? await handleFifoMessages({ messages, sqs })
    : await handleUnorderedMessages({ messages, sqs });
}

// We follow the convention that FIFO queues end with .fifo.
function isFifoQueue(message: SQSMessage): message is SQSFifoMessage {
  return getQueueName(message).endsWith(".fifo");
}

// Standard queue: we can process the batch of messages in an order.
// Returns IDs of messages that failed to process.
async function handleUnorderedMessages({
  messages,
  sqs,
}: {
  messages: SQSMessage[];
  sqs: SQS;
}) {
  const failedMessageIds = await Promise.all(
    messages.map(async (message) =>
      (await handleOneMessage({ message, sqs })) ? null : message.messageId
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
  messages,
  sqs,
}: {
  messages: SQSMessage[];
  sqs: SQS;
}) {
  let message;
  while ((message = messages.shift())) {
    const successful = await handleOneMessage({ message, sqs });
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
  message,
  sqs,
}: {
  message: SQSMessage;
  sqs: SQS;
}): Promise<boolean> {
  const { messageId } = message;
  const queueName = getQueueName(message);
  const module = await loadModule<{
    config?: QueueConfig;
    default?: QueueHandler;
    handler?: QueueHandler;
  }>(`queue/${queueName}`);
  if (!module) throw new Error(`No handler for queue ${queueName}`);

  const handler = module.handler ?? module.default;
  invariant(handler, `No handler for queue ${queueName}`);

  // Create an abort controller to allow the handler to cancel incomplete work.
  const timeout = getTimeout(module.config);
  const controller = new AbortController();
  const abortTimeout = setTimeout(() => controller.abort(), timeout * 1000);

  try {
    console.info("Handling message %s on queue %s", messageId, queueName);
    const { attributes } = message;

    await Promise.race([
      handler(getPayload(message), {
        messageID: message.messageId,
        groupID: attributes.MessageGroupId,
        receivedCount: +attributes.ApproximateReceiveCount,
        sentAt: new Date(+attributes.SentTimestamp),
        sequenceNumber: attributes.SequenceNumber
          ? +attributes.SequenceNumber
          : undefined,
        signal: controller.signal,
      }),

      new Promise((resolve) => {
        controller.signal.addEventListener("abort", resolve);
      }),
    ]);

    if (controller.signal.aborted) {
      throw new Error(
        `Timeout: message took longer than ${timeout} to process`
      );
    } else controller.abort();

    console.info("Deleting message %s on queue %s", messageId, queueName);
    await sqs.deleteMessage({
      QueueUrl: getQueueURL(message),
      ReceiptHandle: message.receiptHandle,
    });
    return true;
  } catch (error) {
    console.error(
      "Error with message %s on queue %s",
      messageId,
      queueName,
      error
    );
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

// Timeout in seconds.
function getTimeout(config?: QueueConfig): number {
  return Math.min(
    Math.max(config?.timeout ?? defaultTimeout, minTimeout),
    maxTimeout
  );
}

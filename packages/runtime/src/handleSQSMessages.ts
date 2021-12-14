import { SQS } from "@aws-sdk/client-sqs";
import ms from "ms";
import { AbortController } from "node-abort-controller";
import invariant from "tiny-invariant";
import { JSONObject, QueueConfig, QueueHandler } from "../types";
import { SQSFifoMessage, SQSMessage } from "../types/lambda";
import loadModule from "./loadModule";

const minTimeout = 1;
const maxTimeout = 30;
const defaultTimeout = 10;

// Handle whatever SQS messages are included in the Lambda event,
// ignores other records
export default async function handleSQSMessages({
  sqs,
  messages,
}: {
  sqs: SQS;
  messages: SQSMessage[];
}) {
  await Promise.all([
    handleUnorderedMessages({ messages, sqs }),
    handleFifoMessages({ messages, sqs }),
  ]);
}

// Messages from regular queues can be processed in parallel
async function handleUnorderedMessages({
  messages,
  sqs,
}: {
  messages: SQSMessage[];
  sqs: SQS;
}) {
  await Promise.all(
    messages
      .filter((message) => !isFifo(message))
      .map(async (message) => await handleOneMessage({ message, sqs }))
  );
}

function isFifo(message: SQSMessage): message is SQSFifoMessage {
  return !!message.attributes.MessageGroupId;
}

// FIFO queues are handled differently.  We can process messages from multiple
// groups in parallel, but within each group, we need to process them in order.
// If we fail for one message in the group, we cannot process the remaining
// messages.
async function handleFifoMessages({
  messages,
  sqs,
}: {
  messages: SQSMessage[];
  sqs: SQS;
}) {
  const groups = new Map<string, SQSFifoMessage[]>();
  for (const message of messages) {
    if (isFifo(message)) {
      const groupId = message.attributes.MessageGroupId;
      const group = groups.get(groupId);
      if (group) group.push(message);
      else groups.set(groupId, [message]);
    }
  }

  await Promise.all(
    Array.from(groups.values()).map(
      async (messages) => await handleFifoGroup({ messages, sqs })
    )
  );
}

async function handleFifoGroup({
  messages,
  sqs,
}: {
  messages: SQSFifoMessage[];
  sqs: SQS;
}) {
  // Extend visibilty until we're done processing all remaining messages.
  // If we need 60 seconds to process first message, and default visibilty is 30,
  // then second message will be returned to the queue, and processed by another
  // Lambda invocation.
  let visibility: Promise<void> | undefined;
  const interval = setInterval(() => {
    visibility = changeVisibilityBatch({ messages, sqs, timeout: 60 });
  }, ms("20s"));

  let message;
  while ((message = messages.shift())) {
    // Handle messages in order, if we fail on one message, we cannot process
    // the remaining messages.
    const successful = await handleOneMessage({ message, sqs });
    if (!successful) break;
  }
  clearInterval(interval);
  if (visibility) await visibility;

  // If there are any remaining messages, return them to the queue.
  if (messages.length > 0)
    await changeVisibilityBatch({ messages, sqs, timeout: 0 });
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

  const timeout = getTimeout(module.config);
  // Extend visibilty until we're done processing the message.
  await changeVisibility({ message, sqs, timeout });

  // Create an abort controller to allow the handler to cancel incomplete work.
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
    clearTimeout(abortTimeout);

    if (controller.signal.aborted) {
      throw new Error(
        `Timeout: message took longer than ${timeout} to process`
      );
    }

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
    // Return message to queue
    await changeVisibility({ message, sqs, timeout: 0 });
    return false;
  }
}

async function changeVisibility({
  message,
  sqs,
  timeout,
}: {
  message: SQSMessage;
  sqs: SQS;
  timeout: number; // in seconds
}) {
  await sqs
    .changeMessageVisibility({
      QueueUrl: getQueueURL(message),
      ReceiptHandle: message.receiptHandle,
      VisibilityTimeout: timeout,
    })
    .catch(console.error);
}

async function changeVisibilityBatch({
  messages,
  sqs,
  timeout,
}: {
  messages: SQSMessage[];
  sqs: SQS;
  timeout: number; // in seconds
}) {
  if (messages.length === 0) return;
  await sqs
    .changeMessageVisibilityBatch({
      // All from the same FIFO group, so obviously from the same queue
      QueueUrl: getQueueURL(messages[0]),
      Entries: messages.map(({ messageId, receiptHandle }) => ({
        Id: messageId,
        ReceiptHandle: receiptHandle,
        VisibilityTimeout: timeout,
      })),
    })
    .catch(console.error);
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

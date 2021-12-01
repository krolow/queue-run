import { SQS } from "@aws-sdk/client-sqs";
import ms from "ms";
import { JSONObject, QueueConfig, QueueHandler } from "../types";
import { LambdaEvent, SQSFifoMessage, SQSMessage } from "./LambdaEvent";
import loadModule from "./loadModule";

// Credentials from the environment
const sqs = new SQS({});

// Handle whatever SQS messages are included in the Lambda event,
// ignores other records
export default async function handleSQSMessages(event: LambdaEvent) {
  const messages = event.Records.filter(isSQSMessage);
  if (messages.length === 0) return;

  await Promise.all([
    handleUnorderedMessages(messages),
    handleFifoMessages(messages),
  ]);
}

function isSQSMessage(record: LambdaEvent["Records"][0]): record is SQSMessage {
  return record.eventSource === "aws:sqs";
}

// Messages from regular queues can be processed in parallel
async function handleUnorderedMessages(messages: SQSMessage[]) {
  await Promise.all(
    messages
      .filter((message) => !isFifo(message))
      .map(async (message) => {
        // Extend visibilty until we're done processing the message.
        const interval = setInterval(
          () => changeVisibility(message, 60),
          ms("30s")
        );
        await handleOneMessage(message);
        clearInterval(interval);
      })
  );
}

function isFifo(message: SQSMessage): message is SQSFifoMessage {
  return !!message.attributes.MessageGroupId;
}

// FIFO queues are handled differently.  We can process messages from multiple
// groups in parallel, but within each group, we need to process them in order.
// If we fail for one message in the group, we cannot process the remaining
// messages.
async function handleFifoMessages(messages: SQSMessage[]) {
  const groups = new Map<string, SQSFifoMessage[]>();
  for (const message of messages) {
    if (isFifo(message)) {
      const groupId = message.attributes.MessageGroupId;
      const group = groups.get(groupId);
      if (group) group.push(message);
      else groups.set(groupId, [message]);
    }
  }

  await Promise.all(Array.from(groups.values()).map(handleFifoGroup));
}

async function handleFifoGroup(messages: SQSFifoMessage[]) {
  // Extend visibilty until we're done processing all remaining messages.
  const interval = setInterval(
    () => changeVisibilityBatch(messages, 60),
    ms("30s")
  );

  let message;
  while ((message = messages.shift())) {
    // Handle messages in order, if we fail on one message, we cannot process
    // the remaining messages.
    const successful = await handleOneMessage(message);
    if (!successful) break;
  }
  clearInterval(interval);
  // Return remaining messages to queue
  if (messages.length > 0) await changeVisibilityBatch(messages, 0);
}

async function handleOneMessage(message: SQSMessage): Promise<boolean> {
  const { messageId } = message;
  const queueName = getQueueName(message);
  const { config, handler } = await loadModule<QueueHandler, QueueConfig>(
    "queue",
    queueName
  );

  try {
    console.info("Handling message %s on queue %s", messageId, queueName);
    await handler(getPayload(message, config));

    console.info("Deleting message %s on queue %s", messageId, queueName);
    await deleteMessage(message);
    return true;
  } catch (error) {
    console.error(
      "Error with message %s on queue %s",
      messageId,
      queueName,
      error
    );
    // Return message to queue
    await changeVisibility(message, 0);
    return false;
  }
}

async function changeVisibility(message: SQSMessage, seconds: number) {
  await sqs
    .changeMessageVisibility({
      QueueUrl: getQueueURL(message),
      ReceiptHandle: message.receiptHandle,
      VisibilityTimeout: seconds,
    })
    .catch(console.error);
}

async function changeVisibilityBatch(messages: SQSMessage[], seconds: number) {
  await sqs
    .changeMessageVisibilityBatch({
      QueueUrl: getQueueURL(messages[0]),
      Entries: messages.map(({ messageId, receiptHandle }) => ({
        Id: messageId,
        ReceiptHandle: receiptHandle,
        VisibilityTimeout: seconds,
      })),
    })
    .catch(console.error);
}

async function deleteMessage(message: SQSMessage) {
  await sqs.deleteMessage({
    QueueUrl: getQueueURL(message),
    ReceiptHandle: message.receiptHandle,
  });
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

// Gets the payload from the message.
//
// If you want the payload as a string, export queue configuration object with
// `payloadAsString: true`.  Or send a message with the attribute `type:
// "text/plain"`.
//
// Otherwise, we assume the payload is a JSON string, but if we can't parse it,
// we pass the payload as raw string.
function getPayload(
  message: SQSMessage,
  config: QueueConfig
): JSONObject | string {
  if (config.payloadAsString) return message.body;

  const type = message.messageAttributes["type"]?.stringValue;
  if (type === "text/plain") return message.body;
  if (type === "application/json") return JSON.parse(message.body);
  try {
    return JSON.parse(message.body);
  } catch {
    return message.body;
  }
}

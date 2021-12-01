import { SQS } from "@aws-sdk/client-sqs";
import ms from "ms";
import { QueueHandler } from "../types";
import getPayload from "./getPayload";
import { LambdaEvent, SQSFifoMessage, SQSMessage } from "./LambdaEvent";
import loadModule from "./loadModule";

const sqs = new SQS({});

export default async function handleSQSMessages(event: LambdaEvent) {
  const messages = event.Records.filter(
    ({ eventSource }) => eventSource === "aws:sqs"
  ) as SQSMessage[];
  if (messages.length === 0) return;

  await Promise.all([
    handleUnorderedMessages(messages),
    handleFifoMessages(messages),
  ]);
}

async function handleUnorderedMessages(messages: SQSMessage[]) {
  const unordered = messages.filter(
    ({ attributes }) => !attributes.MessageGroupId
  );
  await Promise.all(
    unordered.map(async (message) => {
      const interval = setInterval(
        () => changeVisibility(message, 60),
        ms("30s")
      );
      await handleOneMessage(message);
      clearInterval(interval);
    })
  );
}

async function handleFifoMessages(messages: SQSMessage[]) {
  const groups = new Map<string, SQSFifoMessage[]>();
  for (const message of messages) {
    const groupId = message.attributes.MessageGroupId;
    if (groupId) {
      const group = groups.get(groupId);
      if (group) group.push(message as SQSFifoMessage);
      else groups.set(groupId, [message as SQSFifoMessage]);
    }
  }

  await Promise.all(Array.from(groups.values()).map(handleFifoGroup));
}

async function handleFifoGroup(messages: SQSFifoMessage[]) {
  const interval = setInterval(
    () => changeVisibilityBatch(messages, 60),
    ms("30s")
  );

  let message;
  while ((message = messages.shift())) {
    const successful = await handleOneMessage(message);
    if (!successful) break;
  }
  clearInterval(interval);
  if (messages.length > 0) changeVisibilityBatch(messages, 0);
}

async function handleOneMessage(message: SQSMessage): Promise<boolean> {
  const queueName = getQueueName(message);
  const { handler } = await loadModule<QueueHandler>(`queue/${queueName}`);

  try {
    console.info(
      "Handling message %s on queue %s",
      message.messageId,
      queueName
    );
    await handler(getPayload(message));
    console.info(
      "Deleting message %s on queue %s",
      message.messageId,
      queueName
    );
    await deleteMessage(message);
    return true;
  } catch (error) {
    console.error(
      "Error with message %s on queue %s",
      message.messageId,
      queueName,
      error
    );
    await changeVisibility(message, 0);
    return false;
  }
}

function changeVisibility(message: SQSMessage, seconds: number) {
  sqs
    .changeMessageVisibility({
      QueueUrl: getQueueURL(message),
      ReceiptHandle: message.receiptHandle,
      VisibilityTimeout: seconds,
    })
    .catch(console.error);
}

function changeVisibilityBatch(messages: SQSMessage[], seconds: number) {
  sqs
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

function getQueueURL(message: SQSMessage) {
  const [, , , region, accountId, queueName] =
    message.eventSourceARN.split(":");
  return `https://sqs.${region}.amazonaws.com/${accountId}/${queueName}`;
}

function getQueueName(message: SQSMessage) {
  // Looks like "arn:aws:sqs:us-east-2:123456789012:project-branch__queue"
  const qualifiedName = message.eventSourceARN.split(":").pop();
  const queueName = qualifiedName?.match(/^.*__(.*)$/)?.[1];
  if (!queueName)
    throw new Error(`Could not parse queue name from ${qualifiedName}`);
  return queueName;
}

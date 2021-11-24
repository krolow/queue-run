import {
  DeleteMessageCommand,
  ListQueuesCommand,
  Message,
  ReceiveMessageCommand,
} from "@aws-sdk/client-sqs";
import ms from "ms";
import { QueueConfig, QueueHandler } from "../../../types";
import client from "../client";

const VisibilityTimeout = 60 * 5;
const WaitTimeSeconds = 20;

export default async function pollMessages(
  prefix: string,
  queues: Map<string, { handler: QueueHandler; config: QueueConfig }>
) {
  const queueURLs = await getQueuesURLs(prefix);

  console.info(
    "Receiving messages for queues %s",
    [...queues.keys()].map((name) => `${prefix}-${name}`).join(", ")
  );
  queues.forEach(({ handler, config }, name) => {
    const queueName = `${prefix}-${name}`;
    const queueURL = queueURLs.get(queueName);
    if (!queueURL) throw new Error(`Queue ${name} not found`);
    receiveMessagesForQueue({ queueURL, queueName, handler, config });
  });
}

async function receiveMessagesForQueue({
  config,
  handler,
  queueName,
  queueURL,
}: {
  config: QueueConfig;
  handler: QueueHandler;
  queueName: string;
  queueURL: string;
}) {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const messages = await receiveMessages({ queueName, queueURL });
    if (!messages) continue;

    await Promise.all(
      messages.map(async (message) => {
        try {
          console.debug(
            "Received message %s on queue %s",
            message.MessageId,
            queueName
          );

          await handleMessage(message, handler, config);

          const command = new DeleteMessageCommand({
            QueueUrl: queueURL,
            ReceiptHandle: message.ReceiptHandle,
          });
          await client.send(command);
        } catch (error) {
          console.error(
            "Error handling message %s on queue %s",
            message.MessageId,
            queueName,
            error
          );
        }
      })
    );
  }
}

async function receiveMessages({
  queueName,
  queueURL,
}: {
  queueName: string;
  queueURL: string;
}) {
  try {
    const command = new ReceiveMessageCommand({
      AttributeNames: ["All"],
      MessageAttributeNames: ["All"],
      QueueUrl: queueURL,
      VisibilityTimeout,
      WaitTimeSeconds,
    });
    const response = await client.send(command);
    return response.Messages;
  } catch (error) {
    console.error("Error reading message from queue %s", queueName, error);
    await new Promise((resolve) => setTimeout(resolve, ms("10s")));
    return null;
  }
}

async function handleMessage(
  message: Message,
  handler: QueueHandler,
  config: QueueConfig
) {
  const payload =
    config.json === false
      ? message.Body ?? ""
      : JSON.parse(message.Body ?? "{}");
  await handler(payload);
}

async function getQueuesURLs(prefix: string): Promise<Map<string, string>> {
  const command = new ListQueuesCommand({
    QueueNamePrefix: prefix,
  });
  const response = await client.send(command);
  return new Map(
    response.QueueUrls?.map((url) => [url.split("/").pop()!, url])
  );
}

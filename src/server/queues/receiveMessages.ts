import {
  DeleteMessageCommand,
  ListQueuesCommand,
  ReceiveMessageCommand,
} from "@aws-sdk/client-sqs";
import ms from "ms";
import { JSONObject } from "../../../types";
import client from "../client";
import { loadGroup } from "../functions";
import { QueueConfig, QueueHandler } from "./../../../types/index.d";

const VisibilityTimeout = 60 * 5;
const WaitTimeSeconds = 20;

export default async function receiveMessages(prefix: string) {
  const queues = loadGroup("queue", true);
  const queueURLs = await listQueuesURLs(prefix);

  console.info(
    "Receiving messages for queues %s",
    [...queues.keys()].join(", ")
  );
  queues.forEach(({ handler, config }, name) => {
    const queueURL = getQueueURL({ name, prefix, queueURLs });
    if (!queueURL) throw new Error(`Queue ${name} not found`);
    receiveMessagesForQueue({ queueURL, handler, config });
  });
}

async function receiveMessagesForQueue({
  handler,
  queueURL,
}: {
  config: QueueConfig;
  handler: QueueHandler;
  queueURL: string;
}) {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const messages = await receiveMessaegs(queueURL);
    if (!messages) continue;

    await Promise.all(
      messages.map(async (message) => {
        try {
          console.debug(
            "Received message %s on queue %s",
            message.MessageId,
            getQueueName(queueURL)
          );

          console.log(message);

          const payload = JSON.parse(message.Body!) as JSONObject;
          await handler(payload);

          const command = new DeleteMessageCommand({
            QueueUrl: queueURL,
            ReceiptHandle: message.ReceiptHandle,
          });
          await client.send(command);
        } catch (error) {
          console.error(
            "Error handling message %s on queue %s",
            message.MessageId,
            getQueueName(queueURL),
            error
          );
        }
      })
    );
  }
}

async function receiveMessaegs(queueURL: string) {
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
    console.error(
      "Error reading message from queue %s",
      getQueueName(queueURL),
      error
    );
    await new Promise((resolve) => setTimeout(resolve, ms("10s")));
    return null;
  }
}

function getQueueURL({
  name,
  prefix,
  queueURLs,
}: {
  name: string;
  prefix: string;
  queueURLs: Set<string>;
}): string | undefined {
  const ending = `/${prefix}-${name}`;
  return [...queueURLs].find((url) => url.endsWith(ending));
}

function getQueueName(queueURL: string): string {
  return queueURL.split("/").slice(-1)[0]!;
}

async function listQueuesURLs(prefix: string): Promise<Set<string>> {
  const command = new ListQueuesCommand({
    QueueNamePrefix: prefix,
  });
  const response = await client.send(command);
  return new Set(response.QueueUrls);
}

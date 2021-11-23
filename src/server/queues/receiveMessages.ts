import {
  DeleteMessageCommand,
  ListQueuesCommand,
  ReceiveMessageCommand,
} from "@aws-sdk/client-sqs";
import client from "../client";
import loadModules, { Module } from "../loadModules";

const VisibilityTimeout = 60 * 5;
const WaitTimeSeconds = 20;

type Handler = (payload: unknown) => unknown;

export default async function receiveMessages(prefix: string) {
  const queueURLs = await listQueuesURLs(prefix);
  const modules = await loadModules("queue");

  console.info(
    "Queue: receiving messages for %s",
    [...modules.keys()].join(", ")
  );
  modules.forEach((module, name) => {
    const queueURL = getQueueURL({ name, prefix, queueURLs });
    if (!queueURL) throw new Error(`Queue ${name} not found`);
    receiveMessagesForQueue(queueURL, module);
  });
}

async function receiveMessagesForQueue(queueURL: string, module: Module) {
  while (true) {
    const command = new ReceiveMessageCommand({
      QueueUrl: queueURL,
      VisibilityTimeout,
      WaitTimeSeconds,
    });
    const response = await client.send(command);
    const messages = response.Messages;
    if (!messages) continue;

    await Promise.all(
      messages.map(async (message) => {
        console.debug(
          "Queue: received message %s on queue %s",
          message.MessageId,
          queueURL.split("/").slice(-1)
        );

        const payload = JSON.parse(message.Body);
        await module.handler(payload);

        const command = new DeleteMessageCommand({
          QueueUrl: queueURL,
          ReceiptHandle: message.ReceiptHandle,
        });
        await client.send(command);
      })
    );
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
}): string {
  const ending = `/${prefix}-${name}`;
  return [...queueURLs].find((url) => url.endsWith(ending));
}

async function listQueuesURLs(prefix: string): Promise<Set<string>> {
  const command = new ListQueuesCommand({
    QueueNamePrefix: prefix,
  });
  const response = await client.send(command);
  return new Set(response.QueueUrls);
}

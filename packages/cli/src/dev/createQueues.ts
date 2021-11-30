import { CreateQueueCommand } from "@aws-sdk/client-sqs";
import { QueueConfig } from "types";
import client from "../client";

export default async function createQueues(
  prefix: string,
  queues: Map<string, { config: QueueConfig }>
) {
  for (const [name, { config }] of [...queues]) {
    await createQueue(`${prefix}-${name}`, config);
  }
}

async function createQueue(queueName: string, _config?: QueueConfig) {
  // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-sqs/interfaces/createqueuecommandinput.html
  const command = new CreateQueueCommand({
    Attributes: {},
    QueueName: queueName,
  });
  await client.send(command);
  console.debug("Created queue %s", queueName);
}

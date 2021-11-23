import { CreateQueueCommand } from "@aws-sdk/client-sqs";
import client from "../client";
import getTopology from "../topology";

export default async function createQueues() {
  const { queues } = await await getTopology();
  for (const [name, { config }] of queues) {
    await createQueue(name, exports.config);
  }
}

async function createQueue(name: string, config?: {}) {
  // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-sqs/interfaces/createqueuecommandinput.html
  const command = new CreateQueueCommand({
    Attributes: {},
    QueueName: name,
  });
  await client.send(command);
  console.info("Queue: created queue %s", name);
}

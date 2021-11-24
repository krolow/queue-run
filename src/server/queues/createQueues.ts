import { CreateQueueCommand } from "@aws-sdk/client-sqs";
import client from "../client";
import getTopology from "../functions";

export default async function createQueues() {
  const { queues } = getTopology();
  for (const [name, { config }] of [...queues.entries()]) {
    await createQueue(name, config);
  }
}

async function createQueue(name: string, _config?: unknown) {
  // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-sqs/interfaces/createqueuecommandinput.html
  const command = new CreateQueueCommand({
    Attributes: {},
    QueueName: name,
  });
  await client.send(command);
  console.debug("Created queue %s", name);
}

import loadModule from "./loadModule";
import RunOrder from "./RunOrder";
import "./setupEnv";
import type { SQSEvent, SQSMessage } from "./SQSEvent";

export async function handler(event: SQSEvent) {
  const runOrders = new Map<string, RunOrder>();
  for (const message of event.Records) {
    const queueName = getQueueName(message);
    const { config, handler } = await loadModule(queueName);
    const runOrder =
      runOrders.get(queueName) ?? new RunOrder(queueName, handler, config);
    runOrders.set(queueName, runOrder);
    runOrder.addMessage(message);
  }
  await Promise.all(
    Array.from(runOrders.values()).map(
      async (runOrder) => await runOrder.handleAllMessages()
    )
  );
}

function getQueueName(message: SQSMessage) {
  // Looks like "arn:aws:sqs:us-east-2:123456789012:project-branch__queue"
  const qualifiedName = message.eventSourceARN.split(":").pop();
  const queueName = qualifiedName?.match(/^.*__(.*)$/)?.[1];
  if (!queueName)
    throw new Error(`Could not parse queue name from ${qualifiedName}`);
  return queueName;
}

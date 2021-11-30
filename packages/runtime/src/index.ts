import sourceMapSupport from "source-map-support";
import { JSONObject, QueueConfig, QueueHandler } from "../types";

// See https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html
type SQSEvent = {
  Records: Array<SQSMessage>;
};

type SQSMessage = {
  attributes: SQSMessageAttributes;
  awsRegion: string;
  body: string;
  eventSource: "aws:sqs";
  eventSourceARN: string;
  md5OfBody: string;
  messageAttributes: { [key: string]: { stringValue: string } };
  messageId: string;
  receiptHandle: string;
};

type SQSMessageAttributes = {
  ApproximateFirstReceiveTimestamp: string;
  ApproximateReceiveCount: string;
  SenderId: string;
  SentTimestamp: string;
} & Partial<SQSFifoMessageAttributes>;

type SQSFifoMessageAttributes = {
  MessageDeduplicationId: string;
  MessageGroupId: string;
  SequenceNumber: string;
};

type SQSBatchResponse = {
  BatchItemFailures: Array<{
    ItemIdentifier: string;
  }>;
};

const handlers = new Map<
  string,
  { config: QueueConfig; handler: QueueHandler }
>();

export async function handler(event: SQSEvent): Promise<SQSBatchResponse> {
  const failedMessageIds: string[] = [];
  await Promise.all(
    event.Records.map(async (message) => {
      try {
        console.info(
          "Handling message %s on queue %s",
          message.messageId,
          getQueueName(message)
        );
        const { config, handler } = await getModule(message);
        const payload = getPayload(message, config);
        await handler(payload);
      } catch (error) {
        failedMessageIds.push(message.messageId);
        console.error(
          "Error with message %s on queue %s",
          message.messageId,
          getQueueName(message),
          error
        );
      }
    })
  );
  return {
    BatchItemFailures: failedMessageIds.map((id) => ({ ItemIdentifier: id })),
  };
}

async function getModule(message: SQSMessage): Promise<{
  config: QueueConfig;
  handler: QueueHandler;
}> {
  const queueName = getQueueName(message);
  const module = handlers.get(queueName);
  if (module) return module;

  const { config, handler } = await import(`background/queue/${queueName}.js`);
  handlers.set(queueName, { config, handler });
  return { config, handler };
}

function getPayload(
  message: SQSMessage,
  config: QueueConfig
): JSONObject | string {
  if (config.json === false) return message.body;
  try {
    return JSON.parse(message.body);
  } catch {
    throw new Error("Expected message body to be JSON document");
  }
}

function getQueueName(message: SQSMessage) {
  // Looks like "arn:aws:sqs:us-east-2:123456789012:my-queue"
  return message.eventSourceARN.split(":").pop() as string;
}

function setupEnv() {
  process.env.NODE_ENV = "production";
  sourceMapSupport.install({ environment: "node" });
}

setupEnv();

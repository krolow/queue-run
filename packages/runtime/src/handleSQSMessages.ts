import { SQS } from "@aws-sdk/client-sqs";
import {
  getLocalStorage,
  handleQueuedJob,
  LocalStorage,
  QueueHandler,
} from "queue-run";
import { URLSearchParams } from "url";

export type SQSBatchResponse = {
  // https://docs.aws.amazon.com/lambda/latest/dg/with-ddb.html#services-ddb-batchfailurereporting
  batchItemFailures: Array<{ itemIdentifier: string }>;
};

export declare type SQSMessage = {
  attributes: {
    ApproximateFirstReceiveTimestamp: string;
    ApproximateReceiveCount: string;
    MessageDeduplicationId?: string;
    MessageGroupId?: string;
    SenderId: string;
    SentTimestamp: string;
    SequenceNumber?: string;
  };
  awsRegion: string;
  body: string;
  eventSource: "aws:sqs";
  eventSourceARN: string;
  md5OfBody: string;
  messageAttributes: {
    [key: string]: {
      stringValue: string;
    };
  };
  messageId: string;
  receiptHandle: string;
};

export default async function handleSQSMessages({
  getRemainingTimeInMillis,
  messages,
  newLocalStorage,
  sqs,
}: {
  getRemainingTimeInMillis: () => number;
  messages: SQSMessage[];
  newLocalStorage: () => LocalStorage;
  sqs: SQS;
}): Promise<SQSBatchResponse> {
  return isFifoQueue(messages[0])
    ? await handleFifoMessages({
        getRemainingTimeInMillis,
        messages,
        newLocalStorage,
        sqs,
      })
    : await handleStandardMessages({
        getRemainingTimeInMillis,
        messages,
        newLocalStorage,
        sqs,
      });
}

// We follow the convention that FIFO queues end with .fifo.
function isFifoQueue(message: SQSMessage): boolean {
  return getQueueName(message).endsWith(".fifo");
}

// Standard queue: we can process the batch of messages in an order.
// Returns IDs of messages that failed to process.
async function handleStandardMessages({
  getRemainingTimeInMillis,
  messages,
  newLocalStorage,
  sqs,
}: {
  getRemainingTimeInMillis: () => number;
  messages: SQSMessage[];
  newLocalStorage: () => LocalStorage;
  sqs: SQS;
}) {
  const remainingTime = getRemainingTimeInMillis();
  const failedMessageIds = await Promise.all(
    messages.map(async (message) => {
      const successful = await getLocalStorage().run(newLocalStorage(), () =>
        handleOneSQSMessage({ message, sqs, remainingTime })
      );
      return successful ? null : message.messageId;
    })
  );
  return {
    batchItemFailures: failedMessageIds
      .filter(Boolean)
      .map((id) => ({ itemIdentifier: id! })),
  };
}

// FIFO queue: we get a batch of message from the same group.
// Process messages in order, fail on the first message that fails, and
// return that and all subsequent message IDs.
async function handleFifoMessages({
  getRemainingTimeInMillis,
  messages,
  newLocalStorage,
  sqs,
}: {
  getRemainingTimeInMillis: () => number;
  messages: SQSMessage[];
  newLocalStorage: () => LocalStorage;
  sqs: SQS;
}) {
  let next;
  while ((next = messages.shift())) {
    const message = next;
    const remainingTime = getRemainingTimeInMillis();
    const successful = await getLocalStorage().run(newLocalStorage(), () =>
      handleOneSQSMessage({ message, sqs, remainingTime })
    );
    if (!successful) {
      return {
        batchItemFailures: [next]
          .concat(messages)
          .map((message) => ({ itemIdentifier: message.messageId })),
      };
    }
  }
  return { batchItemFailures: [] };
}

export async function handleOneSQSMessage({
  message,
  remainingTime,
  sqs,
}: {
  message: SQSMessage;
  remainingTime: number;
  sqs: SQS;
}): Promise<boolean> {
  const queueName = getQueueName(message);
  const successful = await handleQueuedJob({
    queueName,
    metadata: getMetadata(message),
    payload: getPayload(message),
    remainingTime,
  });
  if (successful && (await sqs.config.region()) !== "localhost") {
    console.info(
      "Deleting message %s from queue %s",
      message.messageId,
      queueName
    );
    await sqs.deleteMessage({
      QueueUrl: getQueueURL(message),
      ReceiptHandle: message.receiptHandle,
    });
  }
  return successful;
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

// Gets the payload from the message.  We rely on the content type, otherwise
// guess by trying to parse as JSON.
function getPayload(message: SQSMessage): Buffer | string | object {
  const type = message.messageAttributes["type"]?.stringValue;
  if (type === "application/json") return JSON.parse(message.body);
  if (type) return message.body;
  try {
    return JSON.parse(message.body);
  } catch {
    return message.body;
  }
}

function getMetadata(
  message: SQSMessage
): Omit<Parameters<QueueHandler>[1], "signal"> {
  const { attributes } = message;
  const userId = message.messageAttributes["userId"]?.stringValue;
  const params = Array.from(
    new URLSearchParams(
      message.messageAttributes["params"]?.stringValue
    ).entries()
  ).reduce((all, [name, value]) => ({ ...all, [name]: value }), {});

  return {
    messageID: message.messageId,
    groupID: attributes.MessageGroupId,
    params,
    queueName: getQueueName(message),
    receivedCount: +attributes.ApproximateReceiveCount,
    sentAt: new Date(+attributes.SentTimestamp),
    sequenceNumber: attributes.SequenceNumber
      ? +attributes.SequenceNumber
      : undefined,
    user: userId ? { id: userId } : undefined,
  };
}

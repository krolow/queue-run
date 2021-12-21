import { SQS } from "@aws-sdk/client-sqs";
import { Services } from "@queue-run/runtime";
import { URL } from "url";

export async function createQueues({
  prefix,
  queues,
}: {
  prefix: string;
  queues: Services["queues"];
}): Promise<string[]> {
  if (queues.size === 0) return [];

  const sqs = new SQS({});
  const queueTimeout = Math.max(
    ...Array.from(queues.values()).map((queue) => queue.timeout * 6)
  );

  return await Promise.all(
    Array.from(queues.keys()).map(async (name) => {
      // createQueue is idempotent so we can safely call it on each deploy.
      // However, createQueue fails if the queue already exists, but with
      // different attributes, so we split createQueue and setQueueAttributes
      // into two separate calls.
      const isFifo = name.endsWith(".fifo");
      const { QueueUrl: queueURL } = await sqs.createQueue({
        QueueName: `${prefix}${name}`,
        Attributes: {
          ...(isFifo
            ? {
                ContentBasedDeduplication: "true",
                DeduplicationScope: "messageGroupId",
                FifoQueue: "true",
                FifoThroughputLimit: "perMessageGroupId",
              }
            : undefined),
        },
      });
      if (!queueURL) throw new Error(`Could not create queue ${name}`);

      await sqs.setQueueAttributes({
        QueueUrl: queueURL,
        Attributes: {
          VisibilityTimeout: queueTimeout.toFixed(0),
        },
      });

      return arnFromQueueURL(queueURL);
    })
  );
}

export async function deleteOldQueues({
  prefix,
  queueARNs,
}: {
  prefix: string;
  queueARNs: string[];
}) {
  const sqs = new SQS({});
  const { QueueUrls: queueURLs } = await sqs.listQueues({
    QueueNamePrefix: prefix,
  });
  if (!queueURLs) return;

  const set = new Set(queueARNs);
  const toDelete = queueURLs.filter((url) => !set.has(arnFromQueueURL(url)));
  await Promise.all(
    toDelete.map(async (url) => {
      console.info("µ: Deleting old queue %s", nameFromQueueURL(url));
      await sqs.deleteQueue({ QueueUrl: url });
    })
  );
}

function arnFromQueueURL(queueURL: string): string {
  // Looks like https://sqs.{region}.amazonaws.com/{accountId}/{queueName}
  const { hostname, pathname } = new URL(queueURL);
  const region = hostname.match(/^sqs\.(.+?)\.amazonaws\.com/)?.[1];
  const [accountId, name] = pathname.split("/").slice(1);
  return `arn:aws:sqs:${region}:${accountId}:${name}`;
}

function nameFromQueueURL(queueURL: string): string {
  // Looks like https://sqs.{region}.amazonaws.com/{accountId}/{queueName}
  const { pathname } = new URL(queueURL);
  return pathname.split("/")[2];
}

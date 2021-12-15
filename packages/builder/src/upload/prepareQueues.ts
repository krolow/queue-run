import { SQS } from "@aws-sdk/client-sqs";
import { QueueConfig } from "@queue-run/runtime";
import { URL } from "url";

export async function createQueues({
  configs,
  prefix,
  region,
  lambdaTimeout,
}: {
  configs: Map<string, { config?: QueueConfig }>;
  prefix: string;
  region: string;
  lambdaTimeout: number;
}): Promise<string[]> {
  const sqs = new SQS({ region });

  return await Promise.all(
    Array.from(configs.entries()).map(async ([name, { config }]) => {
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
          VisibilityTimeout: lambdaTimeout.toFixed(0),
        },
      });

      if (config && Object.keys(config).length > 0)
        console.info("µ: Using queue %s %o", name, config);
      else console.info("µ: Using queue %s", name);

      return arnFromQueueURL(queueURL);
    })
  );
}

export async function deleteOldQueues({
  prefix,
  queueARNs,
  region,
}: {
  prefix: string;
  queueARNs: string[];
  region: string;
}) {
  const sqs = new SQS({ region });

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

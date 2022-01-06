import { SQS } from "@aws-sdk/client-sqs";
import ora from "ora";
import { Manifest } from "queue-run";
import invariant from "tiny-invariant";
import { URL } from "url";

export async function createQueues({
  prefix,
  queues,
}: {
  prefix: string;
  queues: Manifest["queues"];
}): Promise<string[]> {
  if (queues.length === 0) return [];

  const sqs = new SQS({});
  const queueTimeout = Math.max(
    ...Array.from(queues.values()).map((queue) => queue.timeout * 6)
  );

  const queueNames = queues.map(({ queueName }) => `"${queueName}"`).join(", ");
  const spinner = ora(`Using queues ${queueNames}`).start();

  const arns = await Promise.all(
    queues.map(async ({ queueName }) => {
      // createQueue is idempotent so we can safely call it on each deploy.
      // However, createQueue fails if the queue already exists, but with
      // different attributes, so we split createQueue and setQueueAttributes
      // into two separate calls.
      const isFifo = queueName.endsWith(".fifo");
      const { QueueUrl: queueURL } = await sqs.createQueue({
        QueueName: `${prefix}${queueName}`,
        Attributes: {
          ...(isFifo
            ? {
                ContentBasedDeduplication: "true",
                DeduplicationScope: "messageGroup",
                FifoQueue: "true",
                FifoThroughputLimit: "perMessageGroupId",
              }
            : undefined),
        },
      });
      if (!queueURL) throw new Error(`Could not create queue ${queueName}`);

      await sqs.setQueueAttributes({
        QueueUrl: queueURL,
        Attributes: {
          VisibilityTimeout: queueTimeout.toFixed(0),
        },
      });

      return arnFromQueueURL(queueURL);
    })
  );
  spinner.succeed();
  return arns;
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
  const queueName = pathname.split("/")[2];
  invariant(queueName, "Incorrectly formatted queue URL");
  return queueName;
}

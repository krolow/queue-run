import { SQS } from "@aws-sdk/client-sqs";
import { QueueConfig } from "@queue-run/runtime";
import { URL } from "url";

export async function createQueues({
  configs,
  prefix,
  region,
}: {
  configs: Map<string, { config?: QueueConfig }>;
  prefix: string;
  region: string;
}): Promise<string[]> {
  const sqs = new SQS({ region });

  return await Promise.all(
    Array.from(configs.entries()).map(async ([name]) => {
      const { QueueUrl } = await sqs.createQueue({
        QueueName: `${prefix}${name}`,
      });
      if (!QueueUrl) throw new Error(`Could not create queue ${name}`);
      const arn = arnFromQueueURL(QueueUrl);
      console.info("µ: With queue %s", name);
      return arn;
    })
  );
}

export async function deleteOldQueues({
  prefix,
  queueArns,
  region,
}: {
  prefix: string;
  queueArns: string[];
  region: string;
}) {
  const sqs = new SQS({ region });

  const { QueueUrls } = await sqs.listQueues({
    QueueNamePrefix: prefix,
  });
  if (!QueueUrls) return;

  const set = new Set(queueArns);
  const toDelete = QueueUrls.filter(
    (QueueUrl) => !set.has(arnFromQueueURL(QueueUrl))
  );
  if (toDelete.length === 0) return;

  console.info(
    "µ: Deleting old queues %s …",
    toDelete.map(nameFromQueueURL).join(", ")
  );
  await Promise.all(
    toDelete.map(async (QueueUrl) => sqs.deleteQueue({ QueueUrl }))
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

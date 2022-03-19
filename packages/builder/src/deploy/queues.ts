import { CloudWatch } from "@aws-sdk/client-cloudwatch";
import { SQS } from "@aws-sdk/client-sqs";
import { URL } from "node:url";
import invariant from "tiny-invariant";

export async function listQueues({
  // Count messages for time time period (ms)
  period,
  project,
  region,
}: {
  period: number;
  project: string;
  region: string;
}) {
  const sqs = new SQS({ region });
  const prefix = `qr-${project}__`;
  const { QueueUrls: queueUrls } = await sqs.listQueues({
    QueueNamePrefix: prefix,
  });
  if (!queueUrls) return [];

  const cloudWatch = new CloudWatch({ region });
  const end = new Date();
  const start = new Date(end.getTime() - period);

  return await Promise.all(
    queueUrls.map(async (url) => {
      const queueName = nameFromQueueURL(url);
      const { MetricDataResults } = await cloudWatch.getMetricData({
        MetricDataQueries: [
          { name: "NumberOfMessagesSent", aggregate: "Sum" },
          {
            name: "ApproximateNumberOfMessagesNotVisible",
            aggregate: "Maximum",
          },
          { name: "NumberOfMessagesDeleted", aggregate: "Sum" },
          { name: "ApproximateAgeOfOldestMessage", aggregate: "Maximum" },
        ].map((metric) => ({
          MetricStat: {
            Metric: {
              MetricName: metric.name,
              Namespace: "AWS/SQS",
              Dimensions: [{ Name: "QueueName", Value: queueName }],
            },
            Period: period / 1000,
            Stat: metric.aggregate,
          },
          Id: metric.name.toLocaleLowerCase(),
        })),
        EndTime: new Date(end),
        ScanBy: "TimestampDescending",
        StartTime: new Date(start),
      });

      const [queued, inFlight, processed, oldest] =
        MetricDataResults?.map(({ Values }) => Values?.[0]) ?? [];

      return {
        queueName: queueName.replace(prefix, ""),
        queued,
        inFlight,
        processed,
        oldest,
      };
    })
  );
}

function nameFromQueueURL(queueUrl: string): string {
  // Looks like https://sqs.{region}.amazonaws.com/{accountId}/{queueName}
  const { pathname } = new URL(queueUrl);
  const queueName = pathname.split("/")[2];
  invariant(queueName, "Incorrectly formatted queue URL");
  return queueName;
}

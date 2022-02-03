import { CloudWatch, Datapoint } from "@aws-sdk/client-cloudwatch";
import { Command, Option } from "commander";
import ms from "ms";
import ora from "ora";
import { displayTable, getAPIGatewayURLs } from "queue-run-builder";
import { loadCredentials } from "./project.js";

const command = new Command("metrics").description("show execution metrics");

const rangePeriod = new Option(
  "-r, --range <range>",
  'time range, eg "3h", "7d"'
).default("12h");

command
  .command("lambda")
  .description("Lambda invocations")
  .addOption(rangePeriod)
  .action(async ({ range }: { range: string }) => {
    const { name, awsRegion: region } = await loadCredentials();

    const lambdaName = `qr-${name}`;

    const metrics = await collectMetrics({
      dimension: { name: "FunctionName", value: lambdaName },
      metrics: [
        { name: "Invocations", aggregate: "Sum" },
        { name: "Throttles", aggregate: "Sum" },
        { name: "Errors", aggregate: "Sum" },
        { name: "ConcurrentExecutions", aggregate: "Maximum" },
        { name: "Duration", aggregate: "Average" },
        { name: "Duration", aggregate: "Maximum" },
      ],
      namespace: "AWS/Lambda",
      range: ms(range),
      region,
    });

    displayTable(
      [
        "Timestamp",
        "Invocations",
        "Throttled",
        "Errors",
        "Concurrent",
        "Duration (avg)",
        "Duration (max)",
      ],
      metrics.map(
        ([timestamp, invocations, throttles, errors, concurrent, avg, max]) => [
          new Date(timestamp!).toLocaleString(),
          invocations?.toLocaleString() ?? "",
          throttles?.toLocaleString() ?? "",
          errors?.toLocaleString() ?? "",
          concurrent?.toLocaleString() ?? "",
          avg ? `${avg.toFixed(2)} ms` : "",
          max ? `${max.toFixed(2)} ms` : "",
        ]
      )
    );
  });

command
  .command("http")
  .description("HTTP requests")
  .addOption(rangePeriod)
  .action(async ({ range }: { range: string }) => {
    const { name, awsRegion: region } = await loadCredentials();

    const { httpApiId } = await getAPIGatewayURLs({ project: name, region });

    const metrics = await collectMetrics({
      dimension: { name: "ApiId", value: httpApiId },
      metrics: [
        { name: "Count", aggregate: "SampleCount" },
        { name: "4XXError", aggregate: "Sum" },
        { name: "5XXError", aggregate: "Sum" },
        { name: "Latency", aggregate: "Average" },
        { name: "Latency", aggregate: "Maximum" },
      ],
      namespace: "AWS/ApiGateway",
      range: ms(range),
      region,
    });

    displayTable(
      [
        "Timestamp",
        "Requests",
        "4xx",
        "5xx",
        "Response Time (avg)",
        "Response Time (max)",
      ],
      metrics.map(([timestamp, requests, code4xx, code5xx, avg, max]) => [
        new Date(timestamp!).toLocaleString(),
        requests?.toLocaleString() ?? "",
        code4xx?.toLocaleString() ?? "",
        code5xx?.toLocaleString() ?? "",
        avg ? `${avg.toFixed(2)} ms` : "",
        max ? `${max.toFixed(2)} ms` : "",
      ])
    );
  });

command
  .command("ws")
  .description("WebSocket connections")
  .addOption(rangePeriod)
  .action(async ({ range }: { range: string }) => {
    const { name, awsRegion: region } = await loadCredentials();

    const { wsApiId } = await getAPIGatewayURLs({ project: name, region });

    const metrics = await collectMetrics({
      dimension: { name: "ApiId", value: wsApiId },
      metrics: [
        { name: "ConnectCount", aggregate: "Sum" },
        { name: "MessageCount", aggregate: "Sum" },
        { name: "ExecutionError", aggregate: "Sum" },
        { name: "IntegrationLatency", aggregate: "Average" },
        { name: "IntegrationLatency", aggregate: "Maximum" },
      ],
      namespace: "AWS/ApiGateway",
      range: ms(range),
      region,
    });

    displayTable(
      [
        "Timestamp",
        "Connections",
        "Messages",
        "Errors",
        "Response Time (avg)",
        "Response Time (max)",
      ],
      metrics.map(([timestamp, connections, messages, errors, avg, max]) => [
        new Date(timestamp!).toLocaleString(),
        connections?.toLocaleString() ?? "",
        messages?.toLocaleString() ?? "",
        errors?.toLocaleString() ?? "",
        avg ? `${avg.toFixed(2)} ms` : "",
        max ? `${max.toFixed(2)} ms` : "",
      ])
    );
  });

command
  .command("queue")
  .description("queued jobs")
  .argument("<name>", "queue name")
  .addOption(rangePeriod)
  .action(async (name, { range }: { range: string }) => {
    const { name: project, awsRegion: region } = await loadCredentials();

    const queueName = `qr-${project}__${name}`;

    const metrics = await collectMetrics({
      dimension: { name: "QueueName", value: queueName },
      metrics: [
        { name: "NumberOfMessagesSent", aggregate: "Sum" },
        { name: "NumberOfMessagesDeleted", aggregate: "Sum" },
        { name: "ApproximateNumberOfMessagesNotVisible", aggregate: "Maximum" },
        { name: "ApproximateAgeOfOldestMessage", aggregate: "Maximum" },
      ],
      namespace: "AWS/SQS",
      range: ms(range),
      region,
    });

    displayTable(
      ["Timestamp", "Queued", "Processed", "In-flight", "Oldest message"],
      metrics.map(([timestamp, sent, deleted, inFlight, oldest]) => [
        new Date(timestamp!).toLocaleString(),
        sent ? sent.toLocaleString() : "",
        deleted ? deleted.toLocaleString() : "",
        inFlight ? inFlight.toLocaleString() : "",
        oldest ? ms(oldest * 1000) : "",
      ])
    );
  });

async function collectMetrics({
  dimension,
  metrics,
  namespace,
  range,
  region,
}: {
  dimension: { name: string; value: string };
  metrics: { name: string; aggregate: keyof Datapoint }[];
  namespace: string;
  range: number;
  region: string;
}): Promise<Array<Array<number | undefined>>> {
  const spinner = ora("Collecting queue metrics").start();
  const cloudWatch = new CloudWatch({ region });
  const period = getResolution(range);
  const now = Date.now();
  const end = new Date(now - (now % 60000));
  const start = new Date(end.getTime() - range);

  const datapoints = (await Promise.all(
    metrics.map(async (metric) => {
      const { Datapoints } = await cloudWatch.getMetricStatistics({
        Dimensions: [{ Name: dimension.name, Value: dimension.value }],
        EndTime: end,
        MetricName: metric.name,
        Namespace: namespace,
        Period: period / 1000,
        StartTime: start,
        Statistics: [metric.aggregate],
      });
      return (Datapoints ?? []).map((datapoint) => [
        datapoint.Timestamp!.getTime(),
        datapoint[metric.aggregate],
      ]);
    })
  )) as Array<Array<[number, number | undefined]>>;

  const collected = [];
  for (
    let timestamp = start.getTime();
    timestamp < end.getTime();
    timestamp += period
  ) {
    collected.push([
      timestamp,
      ...datapoints.map(
        (datapoints) =>
          datapoints.find((datapoint) => datapoint[0] === timestamp)?.[1]
      ),
    ]);
  }
  spinner.stop();
  return collected;
}

function getResolution(range: number) {
  if (range < ms("1h")) return ms("1m");
  if (range < ms("12h")) return ms("10m");
  if (range < ms("3d")) return ms("1h");
  if (range < ms("7d")) return ms("4h");
  return ms("1d");
}

export default command;

import { CloudWatch } from "@aws-sdk/client-cloudwatch";
import { Command } from "commander";
import ora from "ora";
import { displayTable } from "queue-run-builder";
import { loadCredentials } from "./project.js";

const command = new Command("stats");

command
  .command("invocations")
  .description("invocations over last 24 hours")
  .action(async () => {
    const { name, awsRegion: region } = await loadCredentials();

    const spinner = ora("Getting invocation metrics").start();
    const cloudWatch = new CloudWatch({ region });
    const period = 60 * 60; // 1 hour
    const range = period * 24; // 1 day
    const now = Date.now();
    const end = now - (now % 60000);
    const start = end - range * 1000;
    const lambdaName = `qr-${name}`;

    const [invocations, errors, duration] = await Promise.all([
      getLambdaMetric({
        cloudWatch,
        lambdaName,
        period,
        start,
        end,
        metric: "Invocations",
      }),
      getLambdaMetric({
        cloudWatch,
        lambdaName,
        period,
        start,
        end,
        metric: "Errors",
      }),
      getLambdaMetric({
        cloudWatch,
        lambdaName,
        period,
        start,
        end,
        metric: "Duration",
      }),
    ]);

    const metrics = [];
    for (let timestamp = start; timestamp < end; timestamp += period * 1000) {
      metrics.push({
        timestamp,
        invocations:
          invocations.find(
            ({ Timestamp }) => Timestamp!.getTime() === timestamp
          )?.Sum ?? 0,
        errors:
          errors.find(({ Timestamp }) => Timestamp!.getTime() === timestamp)
            ?.Sum ?? 0,
        average: duration.find(
          ({ Timestamp }) => Timestamp!.getTime() === timestamp
        )?.Average,
        maximum: duration.find(
          ({ Timestamp }) => Timestamp!.getTime() === timestamp
        )?.Maximum,
      });
    }
    spinner.stop();

    displayTable(
      [
        "Timestamp",
        "Invocations",
        "Errors",
        "Duration (avg)",
        "Duration (max)",
      ],
      metrics.map(({ timestamp, invocations, errors, average, maximum }) => [
        new Date(timestamp).toLocaleTimeString(),
        invocations.toLocaleString(),
        errors.toLocaleString(),
        average ? `${average.toFixed(0)} ms` : "",
        maximum ? `${maximum.toFixed(0)} ms` : "",
      ])
    );
  });

async function getLambdaMetric({
  cloudWatch,
  lambdaName,
  metric,
  period,
  start,
  end,
}: {
  cloudWatch: CloudWatch;
  lambdaName: string;
  metric: string;
  period: number;
  start: number;
  end: number;
}) {
  const { Datapoints } = await cloudWatch.getMetricStatistics({
    EndTime: new Date(end),
    Namespace: "AWS/Lambda",
    MetricName: metric,
    Period: period,
    StartTime: new Date(start),
    Statistics: ["Sum", "Average", "Maximum"],
    Dimensions: [{ Name: "FunctionName", Value: lambdaName }],
  });
  return Datapoints ?? [];
}

export default command;

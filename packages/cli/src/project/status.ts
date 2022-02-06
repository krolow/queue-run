import { Lambda } from "@aws-sdk/client-lambda";
import { Command } from "commander";
import filesize from "filesize";
import ms from "ms";
import ora from "ora";
import {
  displayTable,
  getAPIGatewayURLs,
  getRecentVersions,
  listQueues,
  listSchedules,
} from "queue-run-builder";
import { loadCredentials } from "./project.js";

const command = new Command("status")
  .description("status of your project")
  .action(async () => {
    const { name, awsRegion: region } = await loadCredentials();

    const lambdaArn = await showDeployment({ project: name, region });
    await showQueues({ region, project: name });
    await showSchedules(lambdaArn);
  });

async function showDeployment({
  project,
  region,
}: {
  project: string;
  region: string;
}) {
  const spinner = ora("Inspecting deployment").start();

  const [versions, { httpUrl, wsUrl }] = await Promise.all([
    getRecentVersions({ region, slug: project }),
    getAPIGatewayURLs({ project, region }),
  ]);

  const current = versions.find(({ isCurrent }) => isCurrent);
  if (!current)
    throw new Error("No current version found: did you deploy this project?");

  const lambda = new Lambda({ region });
  const currentArn = current.arn.replace(/:\d+$/, ":current");
  // Version/alias not supported when reading concurrency configuration
  const concurrencyArn = current.arn.replace(/:\w+$/, "");
  const [
    { MemorySize: memory, Timeout: timeout },
    { ReservedConcurrentExecutions: reserved },
    { ProvisionedConcurrencyConfigs: provisioned },
  ] = await Promise.all([
    lambda.getFunctionConfiguration({
      FunctionName: currentArn,
    }),
    lambda.getFunctionConcurrency({
      FunctionName: concurrencyArn,
    }),
    lambda.listProvisionedConcurrencyConfigs({
      FunctionName: concurrencyArn,
    }),
  ]);

  spinner.stop();

  displayTable(
    ["Name", project],
    [
      ["Version", current.version],
      ["Code size", filesize(current.size)],
      ["Deployed", current.modified.toLocaleString()],
      ["Region", region],
      ["Available memory", filesize(memory! * 10000 * 1000)],
      ["Timeout", ms(timeout! * 1000)],
      ["Reserved concurrency", reserved?.toLocaleString() ?? "no reserve"],
      ...(provisioned
        ? (provisioned
            .map((concurrency) => [
              ["Provisioned concurrency", concurrency.Status],
              [
                " - Requested",
                concurrency.RequestedProvisionedConcurrentExecutions?.toLocaleString(),
              ],
              [
                " - Allocated",
                concurrency.AllocatedProvisionedConcurrentExecutions?.toLocaleString(),
              ],
              [
                " - Available",
                concurrency.AvailableProvisionedConcurrentExecutions?.toLocaleString(),
              ],
            ])
            .flat() as [string, string][])
        : [["Provisioned", "no"]]),
      ["HTTP", httpUrl],
      ["WebSocket", wsUrl],
    ]
  );

  return currentArn;
}

async function showQueues({
  region,
  project,
}: {
  region: string;
  project: string;
}) {
  const spinner = ora("Inspecting queues").start();
  const queues = await listQueues({ region, period: ms("5m"), project });
  spinner.stop();
  if (queues.length) {
    process.stdout.write("\n\n");
    displayTable(
      ["Queue", "Processed (5m)", "In flight", "Oldest"],
      queues.map(({ queueName, processed, inFlight, oldest }) => [
        queueName,
        processed?.toLocaleString() ?? "0",
        inFlight?.toLocaleString() ?? "0",
        oldest ? ms(+oldest * 1000) : "n/a",
      ])
    );
  }
}

async function showSchedules(lambdaArn: string) {
  const spinner = ora("Inspecting schedules").start();
  const schedules = await listSchedules({ lambdaArn });
  spinner.stop();
  if (schedules.length) {
    process.stdout.write("\n\n");
    displayTable(
      ["Schedule", "Recurring", "Last run", "Next run"],
      schedules.map(({ cron, name, lastRun, nextRun }) => [
        name,
        cron,
        lastRun?.toLocaleString() ?? "n/a",
        nextRun?.toLocaleString() ?? "n/a",
      ])
    );
  }
}

export default command;

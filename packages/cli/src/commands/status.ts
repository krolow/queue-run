import { Lambda } from "@aws-sdk/client-lambda";
import { Command } from "commander";
import filesize from "filesize";
import ms from "ms";
import ora from "ora";
import {
  displayCron,
  displayTable,
  getAPIGatewayURLs,
  getRecentVersions,
  listQueues,
  listSchedules,
} from "queue-run-builder";
import { loadCredentials } from "../shared/config.js";
import { localTimestamp } from "../shared/timestamp.js";

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
  try {
    let versions;
    try {
      versions = await getRecentVersions({ region, slug: project });
    } catch (error) {
      const { name } = error as { name?: string };
      if (name === "ResourceNotFoundException") {
        throw new Error(
          "No deployment found. Did you deploy your project using `npx queue-run deploy`?"
        );
      } else throw error;
    }

    const current = versions.find(({ isCurrent }) => isCurrent);
    if (!current)
      throw new Error("No current version found: did you deploy this project?");

    const { httpUrl, wsUrl } = await getAPIGatewayURLs({ project, region });

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

    displayTable({
      headers: ["Project", project],
      rows: [
        ["Version", current.version],
        ["Code size", filesize(current.size)],
        ["Deployed", localTimestamp(current.modified)],
        ["Region", region],
        ["Available memory", filesize(memory! * 10000 * 1000)],
        ["Timeout", ms(timeout! * 1000)],
        ["Reserved concurrency", reserved ?? "no reserve"],
        ...(provisioned
          ? (provisioned
              .map((concurrency) => [
                ["Provisioned concurrency", concurrency.Status],
                [
                  " - Requested",
                  concurrency.RequestedProvisionedConcurrentExecutions,
                ],
                [
                  " - Allocated",
                  concurrency.AllocatedProvisionedConcurrentExecutions,
                ],
                [
                  " - Available",
                  concurrency.AvailableProvisionedConcurrentExecutions,
                ],
              ])
              .flat() as [string, string][])
          : [["Provisioned", "no"]]),
        ["HTTP", httpUrl],
        ["WebSocket", wsUrl],
      ],
      options: { fullWidth: true, colWidths: [22] },
    });

    return currentArn;
  } catch (error) {
    spinner.fail();
    throw error;
  }
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
    displayTable({
      headers: ["Queue", "Processed (5m)", "In flight", "Oldest"],
      rows: queues.map(({ queueName, processed, inFlight, oldest }) => [
        queueName,
        processed ?? 0,
        inFlight ?? 0,
        oldest ? ms(+oldest * 1000) : "n/a",
      ]),
      options: { fullWidth: true },
    });
  }
}

async function showSchedules(lambdaArn: string) {
  const spinner = ora("Inspecting schedules").start();
  const schedules = await listSchedules({ lambdaArn });
  spinner.stop();
  if (schedules.length) {
    process.stdout.write("\n\n");
    displayTable({
      headers: ["Schedule", "Recurring", "Last run", "Next run"],
      rows: schedules.map(({ cron, name, lastRun, nextRun }) => [
        name,
        displayCron(cron),
        lastRun ? localTimestamp(lastRun) : "n/a",
        nextRun ? localTimestamp(nextRun) : "n/a",
      ]),
      options: { fullWidth: true },
    });
  }
}

export default command;

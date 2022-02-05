import { Lambda } from "@aws-sdk/client-lambda";
import chalk from "chalk";
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
    const lambda = new Lambda({ region });

    process.stdout.write(` Name\t\t: ${name}\n`);

    if (process.stdout.isTTY) {
      process.stdout.write(
        chalk.dim("─".repeat(process.stdout.getWindowSize()[0])) + "\n"
      );
    }

    const lambdaArn = await showDeployment({ project: name, region });
    await showConcurrency({ lambda, lambdaArn });
    await showEndpoints({ project: name, region });
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

  const versions = await getRecentVersions({ region, slug: project });

  const current = versions.find(({ isCurrent }) => isCurrent);
  if (!current)
    throw new Error("No current version found: did you deploy this project?");

  const lambda = new Lambda({ region });
  const currentArn = current.arn.replace(/:\d+$/, ":current");
  const { MemorySize: memory, Timeout: timeout } =
    await lambda.getFunctionConfiguration({
      FunctionName: currentArn,
    });

  spinner.stop();

  process.stdout.write(` Version\t: ${current?.version ?? "n/a"}\n`);
  process.stdout.write(
    ` Code size\t: ${filesize(current.size)} (compressed)\n`
  );
  process.stdout.write(` Deployed\t: ${current.modified.toLocaleString()}\n`);
  process.stdout.write(` Region\t\t: ${region}\n`);
  process.stdout.write(
    ` Avail memory\t: ${filesize(memory! * 10000 * 1000)}\n`
  );
  process.stdout.write(` Timeout\t: ${ms(timeout! * 1000)}\n`);

  return currentArn;
}

async function showEndpoints({
  project,
  region,
}: {
  project: string;
  region: string;
}) {
  const spinner = ora("Inspecting endpoints").start();
  const { httpUrl, wsUrl } = await getAPIGatewayURLs({ project, region });
  spinner.stop();

  process.stdout.write("\n");
  process.stdout.write(` HTTP\t\t: ${httpUrl}\n`);
  process.stdout.write(` WebSocket\t: ${wsUrl}\n`);
}

async function showConcurrency({
  lambda,
  lambdaArn,
}: {
  lambda: Lambda;
  lambdaArn: string;
}) {
  const spinner = ora("Inspecting concurrency").start();
  // Version/alias not supported when reading concurrency configuration
  const concurrencyArn = lambdaArn.replace(/:\w+$/, "");
  const [
    { ReservedConcurrentExecutions: reserved },
    { ProvisionedConcurrencyConfigs: provisioned },
  ] = await Promise.all([
    lambda.getFunctionConcurrency({
      FunctionName: concurrencyArn,
    }),
    lambda.listProvisionedConcurrencyConfigs({
      FunctionName: concurrencyArn,
    }),
  ]);
  spinner.stop();

  process.stdout.write(
    ` Reserved\t: ${
      reserved === 0
        ? "0 (no instances)"
        : typeof reserved === "number"
        ? reserved.toLocaleString()
        : "no reserve"
    }\n`
  );
  if (provisioned?.length) {
    provisioned.forEach(
      ({
        Status,
        RequestedProvisionedConcurrentExecutions,
        AllocatedProvisionedConcurrentExecutions,
        AvailableProvisionedConcurrentExecutions,
      }) => {
        process.stdout.write(` Provisioned\t: ${Status}\n`);
        process.stdout.write(
          ` — Requested\t: ${RequestedProvisionedConcurrentExecutions}\n`
        );
        process.stdout.write(
          ` — Allocated\t: ${AllocatedProvisionedConcurrentExecutions}\n`
        );
        process.stdout.write(
          ` — Available\t: ${AvailableProvisionedConcurrentExecutions}\n`
        );
      }
    );
  } else process.stdout.write(" Provisioned\t: no\n");
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

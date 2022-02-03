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
    const {
      current,
      httpUrl,
      memory,
      name,
      queues,
      provisioned,
      region,
      reserved,
      schedules,
      timeout,
      wsUrl,
    } = await loadStatus();

    process.stdout.write(` Name\t\t: ${name}\n`);

    if (process.stdout.isTTY) {
      process.stdout.write(
        chalk.dim(
          "─".repeat(
            Math.min(wsUrl.length + 18, process.stdout.getWindowSize()[0])
          )
        ) + "\n"
      );
    }

    process.stdout.write(` Version\t: ${current?.version ?? "NONE"}\n`);
    if (!current) return;

    process.stdout.write(
      ` Code size\t: ${filesize(current.size)} (compressed)\n`
    );
    process.stdout.write(` Deployed\t: ${current.modified.toLocaleString()}\n`);

    process.stdout.write(` Region\t\t: ${region}\n`);
    process.stdout.write(
      ` Avail memory\t: ${filesize(memory * 10000 * 1000)}\n`
    );
    process.stdout.write(` Timeout\t: ${ms(timeout * 1000)}\n`);

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
      provisioned.forEach(({ status, requested, allocated, available }) => {
        process.stdout.write(` Provisioned\t: ${status}\n`);
        process.stdout.write(` — Requested\t: ${requested}\n`);
        process.stdout.write(` — Allocated\t: ${allocated}\n`);
        process.stdout.write(` — Available\t: ${available}\n`);
      });
    } else process.stdout.write(" Provisioned\t: no\n");
    process.stdout.write("\n");

    process.stdout.write(` HTTP\t\t: ${httpUrl}\n`);
    process.stdout.write(` WebSocket\t: ${wsUrl}\n`);

    if (queues.length) {
      process.stdout.write("\n\n");
      displayTable(
        ["Queue", "Processed (24h)", "In flight", "Oldest"],
        queues.map(({ queueName, processed, inFlight, oldest }) => [
          queueName,
          processed.toLocaleString(),
          inFlight.toFixed(),
          `${oldest} sec`,
        ])
      );
    }

    if (schedules.length) {
      process.stdout.write("\n\n");
      displayTable(
        ["Schedule", "Recurring", "Next run", "Invoked (24h)"],
        schedules.map(({ name, cron, next, count }) => [
          name,
          cron,
          next?.toString() ?? "never",
          count.toString(),
        ])
      );
    }
  });

async function loadStatus() {
  const { name, awsRegion: region } = await loadCredentials();
  const spinner = ora("Inspecting project").start();

  const [versions, { httpUrl, wsUrl }] = await Promise.all([
    getRecentVersions({ region, slug: name }),
    getAPIGatewayURLs({ project: name, region }),
  ]);

  const current = versions.find(({ isCurrent }) => isCurrent);
  if (!current)
    throw new Error("No current version found: did you deploy this project?");

  const lambda = new Lambda({ region });
  const currentArn = current.arn.replace(/:\d+$/, ":current");
  // Version/alias not supported when reading concurrency configuration
  const concurrencyArn = current.arn.replace(/:\d+$/, "");
  const lambdaName = concurrencyArn.split(":").pop()!;
  const [
    { MemorySize: memory, Timeout: timeout },
    { ReservedConcurrentExecutions: reserved },
    { ProvisionedConcurrencyConfigs: provisioned },
    queues,
    schedules,
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
    listQueues({ region, project: name }),
    listSchedules({ lambdaArn: currentArn }),
  ]);

  spinner.stop();

  return {
    name,
    region,
    current,
    memory: memory ?? 128,
    queues,
    reserved,
    provisioned: provisioned?.map(
      ({
        Status: status,
        RequestedProvisionedConcurrentExecutions: requested,
        AllocatedProvisionedConcurrentExecutions: allocated,
        AvailableProvisionedConcurrentExecutions: available,
      }) => ({ requested, allocated, available, status })
    ),
    schedules,
    timeout: timeout ?? 300,
    httpUrl,
    wsUrl,
  };
}

export default command;

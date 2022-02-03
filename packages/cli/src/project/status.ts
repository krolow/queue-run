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
  getSchedules,
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

    if (schedules.length) {
      process.stdout.write("\n");
      displayTable(
        ["Name", "Schedule", "Next run"],
        schedules.map(({ name, cron, next }) => [
          name,
          cron,
          next?.toString() ?? "never",
        ])
      );
    }
  });

async function loadStatus() {
  const spinner = ora("Inspecting project").start();
  const { name, awsRegion: region } = await loadCredentials();

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
  const [
    { MemorySize: memory, Timeout: timeout },
    { ReservedConcurrentExecutions: reserved },
    { ProvisionedConcurrencyConfigs: provisioned },
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
    getSchedules({ lambdaArn: currentArn }),
  ]);

  spinner.stop();
  return {
    name,
    region,
    current,
    memory: memory ?? 128,
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

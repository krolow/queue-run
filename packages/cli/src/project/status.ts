import { Lambda } from "@aws-sdk/client-lambda";
import chalk from "chalk";
import { Command } from "commander";
import filesize from "filesize";
import ora from "ora";
import { getAPIGatewayURLs, getRecentVersions } from "queue-run-builder";
import { loadCredentials } from "./project.js";

const command = new Command("status")
  .description("status of your project")
  .action(async () => {
    const {
      name,
      region,
      current,
      memory,
      reserved,
      provisioned,
      httpUrl,
      wsUrl,
    } = await loadStatus();

    console.info("  Name\t\t: %s", name);
    console.info(
      chalk.dim("%s"),
      "─".repeat(process.stdout.getWindowSize()[0])
    );

    console.info("  Version\t: %s", current?.version ?? "NONE");
    if (current) {
      console.info("  Code size\t: %s (compressed)", filesize(current.size));
      console.info("  Deployed\t: %s", current.modified.toLocaleString());
    }
    console.info("");

    console.info("  Region\t: %s", region);
    const size =
      memory > 1000 ? (memory / 1000).toFixed(2) + " GB" : memory + " MB";
    console.info("  Avail memory\t: %s", size);
    console.info("");

    console.info(
      "  Reserved\t: %s",
      reserved === 0
        ? "0 (no instances)"
        : typeof reserved === "number"
        ? reserved.toLocaleString()
        : "no reserve"
    );
    if (provisioned?.length) {
      provisioned.forEach(({ status, requested, allocated, available }) => {
        console.info("  Provisioned\t: %s", status);
        console.info("  ├─ Requested\t: %s", requested);
        console.info("  ├─ Allocated\t: %s", allocated);
        console.info("  └─ Available\t: %s", available);
      });
    } else console.info("  Provisioned\t: no");
    console.info("");

    console.info("  HTTP\t\t: %s", httpUrl);
    console.info("  WebSocket\t: %s", wsUrl);
  });

async function loadStatus() {
  const spinner = ora("Loading project …").start();
  const { name, awsRegion: region } = await loadCredentials();

  const [versions, { httpUrl, wsUrl }] = await Promise.all([
    getRecentVersions({ region, slug: name }),
    getAPIGatewayURLs({ project: name, region }),
  ]);

  const current = versions.find(({ isCurrent }) => isCurrent);
  if (!current)
    throw new Error("No current version found: did you deploy this project?");

  const lambda = new Lambda({ region });
  const [
    { MemorySize: memory },
    { ReservedConcurrentExecutions: reserved },
    { ProvisionedConcurrencyConfigs: provisioned },
  ] = await Promise.all([
    lambda.getFunctionConfiguration({
      FunctionName: current.arn,
    }),
    lambda.getFunctionConcurrency({
      FunctionName: current.arn.replace(/:\d+$/, ""),
    }),
    lambda.listProvisionedConcurrencyConfigs({
      FunctionName: current.arn.replace(/:\w+$/, ""),
    }),
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
    httpUrl,
    wsUrl,
  };
}

export default command;

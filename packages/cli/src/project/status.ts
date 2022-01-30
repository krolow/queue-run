import { Lambda } from "@aws-sdk/client-lambda";
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

    console.info("Name:\t\t%s", name);
    console.info("Region:\t\t%s", region);
    console.info("Version:\t%s", current?.version ?? "NONE");
    if (current) {
      console.info("├─ Code size:\t%s", filesize(current.size));
      console.info("└─ Deployed:\t%s", current.modified.toLocaleString());
    }

    const size =
      memory > 1000 ? (memory / 1000).toFixed(2) + " GB" : memory + " MB";
    console.info("Avail memory:\t%s", size);

    console.info(
      "├─ Reserved:\t%s",
      reserved === 0 ? "0 (no instances)" : reserved ?? "no limit"
    );

    if (provisioned?.length) {
      provisioned.forEach(
        ({ status, requested, allocated, available }, index) => {
          const last = index === provisioned.length - 1;
          console.info("%s Provisioned:\t%s", last ? "└─" : "├─", status);
          console.info("   ├─ Requested:\t%s", requested);
          console.info("   ├─ Allocated:\t%s", allocated);
          console.info("   └─ Available:\t%s", available);
        }
      );
    } else console.info("└─ Provisioned:\tNONE");

    console.info("API:\t\t%s", httpUrl);
    console.info("WebSocket:\t%s", wsUrl);
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

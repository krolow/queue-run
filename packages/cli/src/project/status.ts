import { Lambda } from "@aws-sdk/client-lambda";
import { Command } from "commander";
import filesize from "filesize";
import { getAPIGatewayURLs, getRecentVersions } from "queue-run-builder";
import { loadCredentials } from "./project.js";

const command = new Command("status")
  .description("status of your project")
  .action(async () => {
    const { name, awsRegion: region } = await loadCredentials();

    console.info("Name:\t\t%s", name);
    console.info("Region:\t\t%s", region);

    const versions = await getRecentVersions({ region, slug: name });
    const current = versions.find(({ isCurrent }) => isCurrent);
    if (!current) throw new Error("No current version");

    console.info("Version:\t%s", current.version);
    console.info("├─ Code size:\t%s", filesize(current.size));
    console.info("└─ Deployed:\t%s", current.modified.toLocaleString());

    const lambda = new Lambda({ region });
    await showMemory(lambda, current.arn);
    await showConcurrency(lambda, current.arn);

    const { httpUrl, wsUrl } = await getAPIGatewayURLs({
      project: name,
      region,
    });
    console.info("API:\t\t%s", httpUrl);
    console.info("WebSocket:\t%s", wsUrl);
  });

async function showMemory(lambda: Lambda, arn: string): Promise<void> {
  const { MemorySize } = await lambda.getFunctionConfiguration({
    FunctionName: arn,
  });
  const memory = MemorySize ?? 128;
  const size =
    memory > 1000 ? (memory / 1000).toFixed(2) + " GB" : memory + " MB";
  console.info("Avail memory:\t%s", size);
}

async function showConcurrency(lambda: Lambda, arn: string): Promise<void> {
  console.info("Concurrency:");

  const { ReservedConcurrentExecutions: reserved } =
    await lambda.getFunctionConcurrency({
      FunctionName: arn.replace(/:\d+$/, ""),
    });
  console.info(
    "├─ Reserved:\t%s",
    reserved === 0 ? "0 (no instances)" : reserved ?? "no limit"
  );

  const { ProvisionedConcurrencyConfigs: configs } =
    await lambda.listProvisionedConcurrencyConfigs({
      FunctionName: arn.replace(/:\w+$/, ""),
    });
  for (const config of configs ?? []) {
    console.info("└─ Provisioned:\t%s", config.Status);

    console.info(
      "  ├─ Requested:\t%s",
      config.RequestedProvisionedConcurrentExecutions
    );
    console.info(
      "  ├─ Allocated:\t%s",
      config.AllocatedProvisionedConcurrentExecutions
    );
    console.info(
      "  └─ Available:\t%s",
      config.AvailableProvisionedConcurrentExecutions
    );
  }
}

export default command;

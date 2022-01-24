import { Lambda } from "@aws-sdk/client-lambda";
import { Command } from "commander";
import filesize from "filesize";
import { getAPIGatewayURLs, getRecentVersions } from "queue-run-builder";
import { loadProject } from "./project.js";

const command = new Command("info")
  .description("info about your project")
  .action(async () => {
    const { name, region, runtime } = await loadProject();

    console.info("Name:\t\t%s", name);
    console.info("Region:\t\t%s", region);
    console.info("Runtime:\t%s", runtime);

    const versions = await getRecentVersions({ region, slug: name });
    const current = versions.find(({ isCurrent }) => isCurrent);
    if (!current) throw new Error("No current version");

    console.info("Version:\t%s", current.version);
    console.info("Deployed:\t%s", current.modified.toLocaleString());
    console.info("Code size:\t%s", filesize(current.size));

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
  const { ReservedConcurrentExecutions } = await lambda.getFunctionConcurrency({
    FunctionName: arn.replace(/:\d+$/, ""),
  });
  if (ReservedConcurrentExecutions)
    console.log(
      "Reserved inst:\t%s",
      ReservedConcurrentExecutions ?? "no limit"
    );

  const [fnName, version] = arn.match(/^(.*):(\d+?)$/)!;
  const provisioned = await lambda
    .getProvisionedConcurrencyConfig({
      FunctionName: fnName,
      Qualifier: version,
    })
    .catch(() => null);
  console.log("Provisioned:\t%s", provisioned?.Status ?? "None");
  if (provisioned) {
    console.log(
      "  Requested:\t%s",
      provisioned.RequestedProvisionedConcurrentExecutions
    );
    console.log(
      "  Allocated:\t%s",
      provisioned.AllocatedProvisionedConcurrentExecutions
    );
    console.log(
      "  Available:\t%s",
      provisioned.AvailableProvisionedConcurrentExecutions
    );
  }
}

export default command;

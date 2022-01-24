import { Lambda } from "@aws-sdk/client-lambda";
import { Command } from "commander";
import ora from "ora";
import { loadProject } from "./project.js";

const command = new Command("provisioned")
  .description("set provisioned concurrency")
  .argument("<instances>", "Number of instances (0 to turn off)")
  .action(async (instances: string) => {
    const { name, region } = await loadProject();
    const slug = `qr-${name}`;

    const spinner = ora("Updating provisioned concurrency").start();
    const lambda = new Lambda({ region });
    const number = parseInt(instances, 10);
    if (isNaN(number)) throw new Error('Must be a number or "off"');
    await lambda.putProvisionedConcurrencyConfig({
      FunctionName: slug,
      Qualifier: "current",
      ProvisionedConcurrentExecutions: number,
    });
    spinner.succeed("Updated provisioned concurrency");
  });

export default command;

import { Lambda } from "@aws-sdk/client-lambda";
import { Command } from "commander";
import ora from "ora";
import { loadCredentials } from "../config.js";

const command = new Command("provisioned")
  .description("set provisioned concurrency")
  .argument("<instances>", 'Number of instances, or "off"')
  .action(async (instances: string) => {
    const { name, awsRegion: region } = await loadCredentials();

    const number = parseInt(instances, 10);
    if (instances !== "off" && isNaN(number))
      throw new Error('Must be a number or "off"');
    const lambda = new Lambda({ region });
    const lambdaName = `qr-${name}`;

    const spinner = ora("Updating provisioned concurrency").start();
    const { ProvisionedConcurrencyConfigs: configs } =
      await lambda.listProvisionedConcurrencyConfigs({
        FunctionName: lambdaName,
      });

    await Promise.all(
      (configs ?? [])
        .map(({ FunctionArn: arn }) => arn!.match(/(.*):(\w+)$/)!.slice(1))
        .map(
          async ([fnName, qualifier]) =>
            await lambda.deleteProvisionedConcurrencyConfig({
              FunctionName: fnName,
              Qualifier: qualifier,
            })
        )
    );

    if (number > 0) {
      await lambda.putProvisionedConcurrencyConfig({
        FunctionName: lambdaName,
        Qualifier: "current",
        ProvisionedConcurrentExecutions: number,
      });
    }
    spinner.succeed("Updated provisioned concurrency");
  });

export default command;

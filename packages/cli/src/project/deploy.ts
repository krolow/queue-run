import { IAM } from "@aws-sdk/client-iam";
import chalk from "chalk";
import { Command } from "commander";
import ora from "ora";
import {
  deployLambda,
  setupAPIGateway,
  setupIntegrations,
} from "queue-run-builder";
import invariant from "tiny-invariant";
import { loadCredentials } from "./project.js";

const command = new Command("deploy")
  .description("deploy your project")
  .action(async () => {
    const { name, awsRegion: region } = await loadCredentials();
    const accountId = await getAccountId(region);

    const spinner = ora("Setting up API Gateway...").start();
    const { httpUrl, wsUrl, wsApiId } = await setupAPIGateway({
      project: name,
      region,
    });
    spinner.succeed("Created API Gateway endpoints");

    const lambdaArn = await deployLambda({
      buildDir: ".queue-run",
      sourceDir: process.cwd(),
      config: {
        accountId,
        env: "production",
        httpUrl,
        region,
        slug: name,
        wsApiId,
        wsUrl,
      },
    });
    await setupIntegrations({ project: name, lambdaArn, region: region });

    console.info(chalk.bold.green(`Your API is available at:\t%s`), httpUrl);
    console.info(chalk.bold.green(`WebSocket available at:\t\t%s`), wsUrl);
    console.info(`Try:\n  curl ${httpUrl}`);
  });

export default command;

async function getAccountId(region: string): Promise<string> {
  const iam = new IAM({ region });
  const { User: user } = await iam.getUser({});
  const accountId = user?.Arn?.split(":")[4];
  invariant(accountId, "Could not determine account ID");
  return accountId;
}

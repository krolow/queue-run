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
import { loadProject } from "./project.js";

const command = new Command("deploy")
  .description("deploy your project")
  .action(async () => {
    const { name } = await loadProject();
    const accountId = await getAccountId();
    const region = process.env.AWS_REGION || "us-east-1";

    const spinner = ora("Setting up API Gateway...").start();
    const { httpUrl, wsUrl, wsApiId } = await setupAPIGateway(name);
    spinner.succeed("Created API Gateway endpoints");

    const lambdaArn = await deployLambda({
      buildDir: ".queue-run",
      sourceDir: process.cwd(),
      config: {
        accountId,
        env: "production",
        region,
        slug: name,
        httpUrl,
        wsUrl,
        wsApiId,
      },
    });
    await setupIntegrations({ project: name, lambdaArn });

    console.info(chalk.bold.green(`Your API is available at:\t%s`), httpUrl);
    console.info(chalk.bold.green(`WebSocket available at:\t\t%s`), wsUrl);
    console.info(`Try:\n  curl ${httpUrl}`);
  });

export default command;

async function getAccountId(): Promise<string> {
  const iam = new IAM({});
  const { User: user } = await iam.getUser({});
  const accountId = user?.Arn?.split(":")[4];
  invariant(accountId, "Could not determine account ID");
  return accountId;
}

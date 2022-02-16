import { IAM } from "@aws-sdk/client-iam";
import chalk from "chalk";
import { Command, Option } from "commander";
import ms from "ms";
import ora from "ora";
import {
  deployLambda,
  setupAPIGateway,
  setupIntegrations,
} from "queue-run-builder";
import invariant from "tiny-invariant";
import { loadCredentials } from "../shared/config.js";

const command = new Command("deploy")
  .description("deploy your project")
  .argument("[name]", "the project name")
  .addOption(
    new Option(
      "-e, --env <env...>",
      "environment variables (format: name=value)"
    ).default([])
  )
  .addOption(
    new Option("--region <region>", "AWS region")
      .env("AWS_REGION")
      .default("us-east-1")
  )
  .addHelpText(
    "after",
    `\n
Deploying from CI:
- CI server should supply the environment variables AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY
- Use command line to specify the project name, region, etc

Deploying from 
- Run npx queue-run deploy without any options
- It will ask you for project name, AWS credentials, etc
- These are stored in .queue-run.json, also used by other commands (logs, env, etc)
`
  )
  .action(
    async (
      name: string | undefined,
      { env, region: awsRegion }: { env: string[]; region: string }
    ) => {
      const envVars = getEnvVars(env);
      const project = await loadCredentials({ name, awsRegion });
      const accountId = await getAccountId(project.awsRegion);

      const spinner = ora("Setting up API Gateway...").start();
      const { httpUrl, wsUrl, wsApiId } = await setupAPIGateway({
        project: project.name,
        region: project.awsRegion,
      });
      spinner.stop();

      console.info(
        chalk.bold.green('🐇 Deploying "%s" to %s\n'),
        project.name,
        new URL(httpUrl).origin
      );

      const lambdaArn = await deployLambda({
        buildDir: ".queue-run",
        sourceDir: process.cwd(),
        config: {
          accountId,
          env: "production",
          envVars,
          httpUrl,
          region: project.awsRegion,
          project: project.name,
          wsApiId,
          wsUrl,
        },
      });
      await setupIntegrations({
        project: project.name,
        lambdaArn,
        region: project.awsRegion,
      });

      console.info("");
      console.info(chalk.bold(" HTTP\t\t: %s"), httpUrl);
      console.info(chalk.bold(" WebSocket\t: %s"), wsUrl);
      console.info("");
      console.info(`Try:\n  %s\n`, chalk.blueBright(`curl ${httpUrl}`));

      console.info("🐇 Done in %s", ms(process.uptime() * 1000));
    }
  );

export default command;

function getEnvVars(environment: string[]): Map<string, string> {
  return environment.reduce((map, cur) => {
    const match = cur.match(/^([^=]+)=(.*)$/)?.slice(1);
    if (!match)
      throw new Error('Environment variable must be in the form "name=value"');
    const [key, value] = match;
    return map.set(key, value);
  }, new Map());
}

async function getAccountId(region: string): Promise<string> {
  const iam = new IAM({ region });
  const { User: user } = await iam.getUser({});
  const accountId = user?.Arn?.split(":")[4];
  invariant(accountId, "Could not determine account ID");
  return accountId;
}

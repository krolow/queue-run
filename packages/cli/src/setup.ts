import chalk from "chalk";
import { Command } from "commander";
import fs from "fs/promises";
import inquirer from "inquirer";
import {
  deployLambda,
  deployRuntimeLayer,
  setupAPIGateway,
  setupIntegrations as setupGatewayIntegrations,
} from "queue-run-builder";

const configFilename = ".qr-config.json";

const command = new Command("setup").description(
  "Setup AWS account for self-hosted deployment"
);

command
  .command("runtime", { hidden: true })
  .description("Deploy the Lambda runtime layer")
  .action(deployRuntimeLayer);

command
  .command("project", { isDefault: true })
  .description("Deploy the project for first time")
  .action(async () => {
    await firstDeploy();
  });

async function firstDeploy() {
  const project = await getProjectName();
  const { http, ws } = await setupAPIGateway(project);
  await deployLambda({
    buildDir: ".build",
    sourceDir: process.cwd(),
    config: { env: "production", slug: project, url: http, ws },
  });
  await setupGatewayIntegrations({
    project,
    lambdaARN:
      "arn:aws:lambda:us-east-1:122210178198:function:qr-grumpy-sunshine",
  });

  console.info(chalk.bold.green(`Your API is available at: %s`), http);
  console.info(`Try:\n  curl ${http}`);
}

async function loadConfig() {
  try {
    await fs.access(configFilename);
  } catch {
    return {};
  }
  return JSON.parse(await fs.readFile(configFilename, "utf8"));
}

async function saveConfig(config: any) {
  await fs.writeFile(configFilename, JSON.stringify(config, null, 2));
}

async function getProjectName(): Promise<string> {
  const config = await loadConfig();
  const suggested = await fs
    .readFile("package.json", "utf8")
    .then(JSON.parse)
    .then((pkg) => pkg.name)
    .catch(() => null);

  const answers = await inquirer.prompt([
    {
      default: config.name ?? suggested,
      message: "Project name (alphanumeric + dashes)",
      name: "name",
      type: "input",
      validate: (input: string) =>
        /^[a-zA-Z0-9-]{1,40}$/.test(input)
          ? true
          : "Project name must be 1-40 characters long and can only contain letters, numbers, and dashes",
    },
  ]);
  const { name } = answers;
  await saveConfig({ ...config, name });
  return name;
}

export default command;

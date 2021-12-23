import {
  deployLambda,
  deployRuntimeLayer,
  setupAPIGateway,
  setupIntegrations as setupGatewayIntegrations,
} from "@queue-run/builder";
import chalk from "chalk";
import { Command } from "commander";
import fs from "fs/promises";
import { createInterface, Interface } from "readline";

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
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });
  try {
    const project = await getProjectName(rl);
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
  } finally {
    rl.close();
  }
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

async function getProjectName(rl: Interface): Promise<string> {
  const config = await loadConfig();
  const suggested =
    config.name ??
    (await fs
      .readFile("package.json", "utf8")
      .then(JSON.parse)
      .then((pkg) => pkg.name)
      .catch(() => null));

  const prompt = chalk.bold.blue(
    suggested
      ? `Project name (enter to use: "${suggested}"): `
      : `Project name: `
  );
  const name =
    (await new Promise<string>((resolve) => rl.question(prompt, resolve))) ||
    suggested;
  if (!name) {
    rl.write("Ctrl+C to exit\n");
    return await getProjectName(rl);
  }
  if (!/^[a-zA-Z0-9-]{1,40}$/.test(name.trim())) {
    console.error(
      chalk.bold.red(
        "Project name must be 1-40 characters long and can only contain letters, numbers and dashes"
      )
    );
    return await getProjectName(rl);
  }
  await saveConfig({ ...config, name });
  return name;
}

export default command;

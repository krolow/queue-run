import chalk from "chalk";
import { Command } from "commander";
import {
  deployLambda,
  setupAPIGateway,
  setupIntegrations,
} from "queue-run-builder";
import { loadProject } from "./project.js";

const command = new Command("deploy")
  .description("deploy your project")
  .action(async () => {
    const { name, runtime } = await loadProject();
    if (!(name && runtime))
      throw new Error(
        "You need to setup your project first: npx queue-run init"
      );

    if (runtime === "lambda") await deployRuntimeLambda({ name });
    else throw new Error(`Unsupported runtime: ${runtime}`);
  });

export default command;

async function deployRuntimeLambda({ name }: { name: string }) {
  const { http, ws } = await setupAPIGateway(name);
  const lambdaARN = await deployLambda({
    buildDir: ".queue-run",
    sourceDir: process.cwd(),
    config: { env: "production", slug: name, url: http, ws },
  });
  await setupIntegrations({ project: name, lambdaARN });

  console.info(chalk.bold.green(`Your API is available at: %s`), http);
  console.info(`Try:\n  curl ${http}`);
}

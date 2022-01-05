import chalk from "chalk";
import { Command } from "commander";
import {
  deployLambda,
  deployRuntimeLayer,
  setupAPIGateway,
  setupIntegrations,
} from "queue-run-builder";
import { loadProject } from "./project";

const command = new Command("deploy")
  .description("Deploy your project")
  .action(async () => {
    const { name, runtime } = await loadProject();
    if (!(name && runtime))
      throw new Error(
        "You need to setup your project first: npx queue-run init"
      );

    if (runtime === "lambda") await deployRuntimeLambda({ name });
    else throw new Error(`Unsupported runtime: ${runtime}`);
  });

command
  .command("runtime-lambda", { hidden: true })
  .description("Deploy the Lambda runtime layer")
  .action(async () => await deployRuntimeLayer(true));

export default command;

async function deployRuntimeLambda({ name }: { name: string }) {
  await deployRuntimeLayer();
  const { http, ws } = await setupAPIGateway(name);
  const lambdaARN = await deployLambda({
    buildDir: ".build",
    sourceDir: process.cwd(),
    config: { env: "production", slug: name, url: http, ws },
  });
  await setupIntegrations({ project: name, lambdaARN });

  console.info(chalk.bold.green(`Your API is available at: %s`), http);
  console.info(`Try:\n  curl ${http}`);
}

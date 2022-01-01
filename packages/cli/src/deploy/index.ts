import { Command } from "commander";
import { deployLambda } from "queue-run-builder";

const command = new Command("deploy").description("Deploy your project");

export default command;

command
  .command("direct")
  .description("Deploy straight to AWS")
  .argument(
    "<slug>",
    'The project slug (pattern: [a-z0-9-]+{1,40}, eg: "my-project")'
  )
  .option(
    "-u --url <url>",
    'The backend will be available at this URL (default: "http://[project/branch].queue-run.com")'
  )
  .action(async (slug, { url }) => {
    await deployLambda({
      buildDir: ".build",
      sourceDir: process.cwd(),
      config: { env: "production", slug, url },
    });
  });

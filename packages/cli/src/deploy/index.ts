import { deployProject } from "@queue-run/builder";
import { Command } from "commander";

const command = new Command("deploy").description("Deploy your project");

export default command;

command
  .command("direct")
  .description("Deploy straight to AWS")
  .argument(
    "<project>",
    'The project name (pattern: [a-z]+-[a-z]+{,20}, eg: "grumpy-sunshine")'
  )
  .argument(
    "[branch]",
    'Branch name if this is a preview (pattern: [a-z0-9-]{,20}, eg: "pr-12")'
  )
  .option(
    "-u --url <url>",
    'The backend will be available at this URL (default: "http://[project/branch].queue-run.com")'
  )
  .action(async (project, branch, { url }) => {
    await deployProject({
      buildDir: ".build",
      sourceDir: process.cwd(),
      config: { branch, project, url },
    });
  });

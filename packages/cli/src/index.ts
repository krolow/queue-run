import { buildProject, uploadProject } from "@queue-run/builder";
import { Command, Option } from "commander";
import ms from "ms";
import devServer from "./dev";

const program = new Command().version(require("../package.json").version);

program.addCommand(devServer);

program
  .command("build")
  .description("Build the backend")
  .argument("[source]", "Source directory", "./")
  .option("-o, --output <output>", "Output directory", ".build")
  .action(async (source: string, { output }: { output: string }) => {
    await buildProject({
      install: true,
      sourceDir: source,
      targetDir: output,
    });
  });

const region = new Option("-r, --region <region>", "AWS region")
  .env("AWS_REGION")
  .default("us-east-1")
  .makeOptionMandatory();

program
  .command("upload", { hidden: true })
  .description("Upload Lambda functions")
  .argument("<project>", "Project ID")
  .argument("[branch]", "Branch name", "main")
  .addOption(region)
  .action(async (project, branch, { region }) => {
    await uploadProject({
      buildDir: ".build",
      branch,
      projectId: project,
      region,
    });
  });

program.showSuggestionAfterError();
program.addHelpCommand();
program.configureHelp({
  sortSubcommands: true,
  sortOptions: true,
});
program
  .parseAsync(process.argv)
  .then(() => {
    if (process.stdout.isTTY)
      console.info("🌟 Done in %s", ms(process.uptime() * 1000));
    return undefined;
  })
  .catch((error) => {
    console.error(String(error));
    process.exit(1);
  });

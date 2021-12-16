import { buildProject } from "@queue-run/builder";
import { Command } from "commander";
import ms from "ms";
import devServer from "./dev";

const program = new Command().version(require("../package.json").version);

program.addCommand(devServer);

program
  .command("build")
  .description("Build the backend")
  .option("-o, --output <dir>", "Output directory", ".build")
  .action(async () => {
    const sourceDir = process.cwd();
    await buildProject({ install: false, sourceDir });
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

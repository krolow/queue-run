import { buildProject } from "@queue-run/builder";
import chalk from "chalk";
import { Command } from "commander";
import ms from "ms";
import deploy from "./deploy";
import devServer from "./dev";

const program = new Command().version(require("../package.json").version);

program.addCommand(devServer);
program.addCommand(deploy);

program
  .command("build")
  .description("Build the backend")
  .argument("[source]", "Source directory", "./")
  .option("-o, --output <output>", "Output directory", ".build")
  .action(async (source: string, { output }: { output: string }) => {
    await buildProject({ buildDir: output, sourceDir: source });
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
    console.info(
      chalk.bold.green("🐇 Done in %s"),
      ms(process.uptime() * 1000)
    );
    return undefined;
  })
  .catch((error) => {
    console.error(chalk.bold.red(String(error)));
    console.error(error.stack);
    process.exit(-1);
  });

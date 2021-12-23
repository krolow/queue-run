import chalk from "chalk";
import { Command } from "commander";
import ms from "ms";
import buildCommand from "./build";
import deployCommand from "./deploy";
import devCommand from "./dev";
import setupCommand from "./setup";

const program = new Command().version(require("../package.json").version);

program.addCommand(devCommand);
program.addCommand(deployCommand);
program.addCommand(buildCommand);
program.addCommand(setupCommand);

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
    process.exit(-1);
  });

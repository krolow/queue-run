import chalk from "chalk";
import { Command } from "commander";
import ms from "ms";
import buildCommand from "./build.js";
import devCommand from "./dev/index.js";
import deployCommand from "./project/deploy.js";
import initCommand from "./project/init.js";

const program = new Command();

program.addCommand(devCommand);
program.addCommand(deployCommand);
program.addCommand(buildCommand);
program.addCommand(initCommand);

program.showSuggestionAfterError();
program.addHelpCommand();
program.configureHelp({
  sortSubcommands: true,
  sortOptions: true,
});

async function run() {
  try {
    const { version } = require("../package.json");
    program.version(version);

    await program.parseAsync(process.argv);
    console.info(
      chalk.bold.green("🐇 Done in %s"),
      ms(process.uptime() * 1000)
    );
  } catch (error) {
    console.error(chalk.bold.red(String(error)));
    process.exit(-1);
  }
}

run();

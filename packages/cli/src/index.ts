import chalk from "chalk";
import { Command } from "commander";
import ms from "ms";
import { debuglog } from "util";
import buildCommand from "./build.js";
import devCommand from "./dev/index.js";
import deployCommand from "./project/deploy.js";
import initCommand from "./project/init.js";

const debug = debuglog("queue-run:cli");
const { version } = require("../package.json");

const program = new Command().version(version);

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

try {
  await program.parseAsync(process.argv);
  console.info(chalk.bold.green("🐇 Done in %s"), ms(process.uptime() * 1000));
} catch (error) {
  console.error(chalk.bold.red(String(error)));
  if (error instanceof Error) debug(error.stack!);
  process.exit(-1);
}

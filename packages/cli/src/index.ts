import chalk from "chalk";
import { Command } from "commander";
import ms from "ms";
import fs from "node:fs/promises";
import { debuglog } from "node:util";
import buildCommand from "./build.js";
import devCommand from "./dev/index.js";
import deployCommand from "./project/deploy.js";
import infoCommand from "./project/info.js";
import initCommand from "./project/init.js";
import logsCommand from "./project/logs.js";

const debug = debuglog("queue-run:cli");

const program = new Command();

program.addCommand(buildCommand);
program.addCommand(deployCommand);
program.addCommand(devCommand);
program.addCommand(initCommand);
program.addCommand(logsCommand);
program.addCommand(infoCommand);

program.showSuggestionAfterError();
program.addHelpCommand();
program.configureHelp({
  sortSubcommands: true,
  sortOptions: true,
});

try {
  const { version } = JSON.parse(
    await fs.readFile(
      new URL("../package.json", import.meta.url).pathname,
      "utf-8"
    )
  );
  program.version(version);
  await program.parseAsync(process.argv);
  console.info(chalk.bold.green("🐇 Done in %s"), ms(process.uptime() * 1000));
} catch (error) {
  console.error(String(error));
  if (error instanceof Error) debug(error.stack!);
  process.exit(-1);
}

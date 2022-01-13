import chalk from "chalk";
import { Command } from "commander";
import fs from "fs/promises";
import ms from "ms";
import { debuglog } from "util";
import buildCommand from "./build.js";
import devCommand from "./dev/index.js";
import deployCommand from "./project/deploy.js";
import initCommand from "./project/init.js";

const debug = debuglog("queue-run:cli");

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

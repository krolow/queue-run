import chalk from "chalk";
import { Command } from "commander";
import ms from "ms";
import fs from "node:fs/promises";
import devCommand from "./dev/index.js";
import buildCommand from "./local/build.js";
import policyCommand from "./local/policy.js";
import deployCommand from "./project/deploy.js";
import domainCommand from "./project/domain.js";
import infoCommand from "./project/info.js";
import initCommand from "./project/init.js";
import logsCommand from "./project/logs.js";
import provisionedCommand from "./project/provisioned.js";
import reservedCommand from "./project/reserved.js";
import rollbackCommand from "./project/rollback.js";

const program = new Command();

program.addCommand(buildCommand);
program.addCommand(deployCommand);
program.addCommand(devCommand);
program.addCommand(domainCommand);
program.addCommand(infoCommand);
program.addCommand(initCommand);
program.addCommand(logsCommand);
program.addCommand(policyCommand);
program.addCommand(rollbackCommand);
program.addCommand(reservedCommand);
program.addCommand(provisionedCommand);

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
  if (error instanceof Error) console.log(error.stack!);
  process.exit(-1);
}

import { Command } from "commander";
import fs from "node:fs";
import devCommand from "./dev/index.js";
import buildCommand from "./local/build.js";
import policyCommand from "./local/policy.js";
import deployCommand from "./project/deploy.js";
import domainCommand from "./project/domain.js";
import envvarsCommand from "./project/envvars.js";
import initCommand from "./project/init.js";
import logsCommand from "./project/logs.js";
import provisionedCommand from "./project/provisioned.js";
import reservedCommand from "./project/reserved.js";
import rollbackCommand from "./project/rollback.js";
import statusCommand from "./project/status.js";

const program = new Command("npx queue-run");

program.addCommand(buildCommand);
program.addCommand(deployCommand);
program.addCommand(devCommand);
program.addCommand(domainCommand);
program.addCommand(envvarsCommand);
program.addCommand(statusCommand);
program.addCommand(initCommand);
program.addCommand(logsCommand);
program.addCommand(policyCommand);
program.addCommand(provisionedCommand);
program.addCommand(reservedCommand);
program.addCommand(rollbackCommand);

const { version } = JSON.parse(
  fs.readFileSync(new URL("../package.json", import.meta.url).pathname, "utf-8")
);
program.version(version);

program.showSuggestionAfterError();
program.addHelpCommand();
program.configureHelp({
  sortSubcommands: true,
  sortOptions: true,
});

export default program;

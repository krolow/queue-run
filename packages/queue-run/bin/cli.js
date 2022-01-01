#!/usr/bin/env node
const { execFileSync } = require("child_process");
const chalk = require("chalk");
const path = require("path");

// CLI is provided by queue-run-cli, separate package, keep queue-run smaller.
// On first use, we install queue-run-cli. We don't update node_modules, if you
// nuke it, we'll just install again.

const cliModule = "queue-run-cli";
const projectPath = path.join(process.cwd(), "node_modules");
try {
  require.resolve(cliModule, { paths: [projectPath] });
} catch (error) {
  console.info(chalk.bold.blue("First run: installing %s ...\n"), cliModule);
  execFileSync("npm", ["install", "--no-save", cliModule], {
    stdio: "inherit",
  });
}

require.cache = {};
require(require.resolve(cliModule, { paths: [projectPath] }));

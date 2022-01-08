#!/usr/bin/env node
import chalk from "chalk";
import { execFileSync } from "child_process";
import path from "path";

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

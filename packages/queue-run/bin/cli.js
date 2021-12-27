#!/usr/bin/env node
const { execFileSync } = require("child_process");
const chalk = require("chalk");
const path = require("path");

const cliModule = "@queue-run/cli";
const projectPath = path.join(process.cwd(), "node_modules");
try {
  require.resolve(cliModule, { paths: [projectPath] });
} catch (error) {
  console.info(chalk.bold.blue("First run: installing %s ...\n"), cliModule);
  execFileSync("npm", ["install", cliModule], { stdio: "inherit" });
}

require.cache = {};
require(require.resolve(cliModule, { paths: [projectPath] }));

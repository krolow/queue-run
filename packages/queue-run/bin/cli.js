#!/usr/bin/env node
import { execFileSync } from "child_process";

// CLI is provided by queue-run-cli, separate package, keep queue-run smaller.
//
// On first use, we install queue-run-cli. We don't update package.json, if you
// nuke node_modules, we'll just install again.

const cliModule = "queue-run-cli";
try {
  await import(cliModule);
} catch (error) {
  if (error instanceof Error && error.code === "ERR_MODULE_NOT_FOUND") {
    console.info("First run: installing %s ...\n", cliModule);
    execFileSync("npm", ["install", "--no-save", cliModule], {
      stdio: "inherit",
    });
    await import(cliModule);
  } else throw error;
}

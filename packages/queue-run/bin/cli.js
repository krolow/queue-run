#!/usr/bin/env node
import { execFileSync, fork } from "node:child_process";
import { createRequire } from "node:module";

// CLI is provided by queue-run-cli, separate package, keep queue-run smaller.
const cliModule = "queue-run-cli";
try {
  createRequire(import.meta.url).resolve(cliModule);
} catch (error) {
  if (error instanceof Error && error.code === "MODULE_NOT_FOUND") {
    // On first use, we install queue-run-cli. We don't update package.json, if you
    // nuke node_modules, we'll just install again.
    console.info("First run: installing %s ...\n", cliModule);
    execFileSync(
      "npm",
      ["install", cliModule, "--no-save", "--no-audit", "--no-fund"],
      {
        stdio: "inherit",
      }
    );
  } else throw error;
}

const child = await fork(`node_modules/${cliModule}`, process.argv);
await new Promise(() => {
  child.on("exit", (code) => process.exit(code));
});

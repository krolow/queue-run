#!/usr/bin/env node
import { spawn } from "node:child_process";

const child = spawn("npx", ["queue-run-cli", ...process.argv.slice(2)], {
  stdio: "inherit",
});
await new Promise(() => child.on("exit", (code) => process.exit(code)));

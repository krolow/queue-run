#!/usr/bin/env node
import program from "queue-run-cli";

program.parseAsync(process.argv).catch((error) => {
  console.error(String(error));
  if (error instanceof Error) console.error(error.stack);
  process.exit(-1);
});

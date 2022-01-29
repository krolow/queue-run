#!/usr/bin/env node
import program from "queue-run-cli";

program.parseAsync(process.argv).catch((error) => {
  if (error instanceof Error) console.error(error.stack);
  else console.error(String(error));
  process.exit(-1);
});

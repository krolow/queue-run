#!/usr/bin/env node
import getProgram from "../dist/index.js";

getProgram()
  .then((program) => program.parseAsync(process.argv))
  .catch((error) => {
    if (error instanceof Error) console.error(error.stack);
    else console.error(String(error));
    process.exit(-1);
  });

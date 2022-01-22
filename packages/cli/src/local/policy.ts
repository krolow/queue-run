import { Command } from "commander";
import fs from "node:fs/promises";
import { policy } from "queue-run-builder";

const command = new Command("policy")
  .description("export IAM policy for deployment")
  .option("-o, --output <filename>", "save to file")
  .action(async ({ output }: { output: string }) => {
    if (output) await fs.writeFile(output, JSON.stringify(policy, null, 2));
    else console.log(JSON.stringify(policy, null, 2));
  });

export default command;

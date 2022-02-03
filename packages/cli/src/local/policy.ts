import { Command } from "commander";
import fs from "node:fs/promises";
import { policy } from "queue-run-builder";

const command = new Command("policy")
  .description("export IAM policy for deployment")
  .option("-o, --output <filename>", "save to file")
  .option("-p, --project <project>", "limit policy to single project")
  .action(async ({ output, project }: { output: string; project: string }) => {
    if (output) await fs.writeFile(output, JSON.stringify(policy(project)));
    else {
      const indent = process.stdout.isTTY ? 2 : 0;
      process.stdout.write(
        JSON.stringify(policy(project), null, indent) + "\n"
      );
    }
  });

export default command;

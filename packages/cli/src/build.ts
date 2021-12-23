import { buildProject } from "@queue-run/builder";
import { Command } from "commander";

const command = new Command("build")
  .description("Build the backend")
  .argument("[source]", "Source directory", "./")
  .option("-o, --output <output>", "Output directory", ".build")
  .option("--full", "Full build", false)
  .action(
    async (
      source: string,
      { output, full }: { output: string; full: boolean }
    ) => {
      await buildProject({ buildDir: output, sourceDir: source, full });
    }
  );

export default command;

import { Command } from "commander";
import { buildProject, displayServices } from "queue-run-builder";

const command = new Command("build")
  .description("Build the backend")
  .argument("[source]", "Source directory", "./")
  .option("-o, --output <output>", "Output directory", ".queue-run")
  .option("--full", "Full build", false)
  .action(
    async (
      source: string,
      { output, full }: { output: string; full: boolean }
    ) => {
      const services = await buildProject({
        buildDir: output,
        sourceDir: source,
        full,
      });
      await displayServices({ dirname: output, ...services });
    }
  );

export default command;

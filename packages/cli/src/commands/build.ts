import { Command } from "commander";
import { buildProject, displayManifest } from "queue-run-builder";

const command = new Command("build")
  .description("build the backend")
  .argument("[source]", "source directory", "./")
  .option("-o, --output <output>", "output directory", ".queue-run")
  .option("--full", "full build", false)
  .action(
    async (
      source: string,
      { output, full }: { output: string; full: boolean }
    ) => {
      await buildProject({
        buildDir: output,
        sourceDir: source,
        full,
      });
      console.info("");
      await displayManifest(output);
    }
  );

export default command;

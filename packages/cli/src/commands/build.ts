import { Command } from "commander";
import { buildProject, displayManifest } from "queue-run-builder";
import { loadProject } from "../shared/config.js";

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
      const { name } = await loadProject();
      await buildProject({
        buildDir: output,
        lambdaName: `qr-${name}`,
        sourceDir: source,
        full,
      });
      console.info("");
      await displayManifest(output);
    }
  );

export default command;

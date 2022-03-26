import { Command } from "commander";
import { displayTable, mapStack } from "queue-run-builder";
import { loadCredentials } from "../shared/config.js";

const command = new Command("stack")
  .description("display the AWS stack")
  .argument("[name]", "the project name")
  .option("--yes", "skip confirmation prompt", false)
  .action(
    async (
      name: string | undefined,
      { region: awsRegion }: { region: string }
    ) => {
      const project = await loadCredentials({ name, awsRegion });
      const resources = await mapStack({
        project: project.name,
        region: project.awsRegion,
      });
      if (!resources)
        throw new Error(
          "No deployment found. Did you deploy your project using `npx queue-run deploy`?"
        );

      displayTable({
        headers: ["Resource Type", "ID"],
        rows: resources.map(([type, id]) => [type.replace("::", " "), id]),
      });
    }
  );

export default command;

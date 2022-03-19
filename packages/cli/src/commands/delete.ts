import { Command, Option } from "commander";
import inquirer from "inquirer";
import { deleteLambda } from "queue-run-builder";
import { loadCredentials } from "../shared/config.js";

const command = new Command("delete")
  .description("delete your project")
  .argument("[name]", "the project name")
  .addOption(
    new Option("--region <region>", "AWS region")
      .env("AWS_REGION")
      .default("us-east-1")
  )
  .action(
    async (
      name: string | undefined,
      { region: awsRegion }: { region: string }
    ) => {
      const project = await loadCredentials({ name, awsRegion });
      const answers = await inquirer.prompt([
        {
          message: `Are you sure you want to delete ${project.name}?`,
          name: "confirm",
          type: "confirm",
        },
      ]);
      if (answers.confirm) {
        await deleteLambda({
          project: project.name,
          region: project.awsRegion,
        });
      }
    }
  );

export default command;

import { Lambda } from "@aws-sdk/client-lambda";
import { Command } from "commander";
import ora from "ora";
import { loadCredentials } from "../shared/config.js";

const command = new Command("schedule")
  .description("manually run a scheduled job in production")
  .argument("<name>", "name of the scheduled job")
  .action(async (schedule) => {
    const { name: project, awsRegion: region } = await loadCredentials();
    const spinner = ora("Running scheduled job").start();
    try {
      const lambda = new Lambda({ region });
      const lambdaName = `qr-${project}`;
      const payload = { source: "cli.schedule", schedule };
      await lambda.invoke({
        FunctionName: lambdaName,
        InvocationType: "Event",
        Payload: Buffer.from(JSON.stringify(payload)),
      });
      spinner.succeed();
    } catch (error) {
      spinner.fail();
      throw error;
    }
  });

export default command;

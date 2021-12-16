import { Command, Option } from "commander";
import devServer from "./devServer";
import pushMessage from "./pushMessage";

const command = new Command("dev").description("Run the development server");

export default command;

const port = new Option("-p, --port <port>", "Port to run the server on")
  .env("PORT")
  .default(8001)
  .makeOptionMandatory();

command
  .command("start", { isDefault: true })
  .description("Start the development server (default command)")
  .addOption(port)
  .action(devServer);

command
  .command("queue")
  .description("Push message to the named queue (dev server)")
  .argument("<queueName>", "The queue name")
  .argument(
    "<message>",
    'The message; use @name to read from a file, or "-" to read from stdin'
  )
  .addOption(port)
  .option("-g --group <group>", "Group ID (FIFO queues only)")
  .action(pushMessage);

command
  .command("schedule", { hidden: true })
  .description("Run a scheduled job (dev server)")
  .argument("<jobName>", "The scheduled job name")
  .addOption(port)
  .action(async (jobName, options) => {
    console.log("run job", jobName, options);
  });

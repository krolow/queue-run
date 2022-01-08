import { Command, Option } from "commander";
import devServer from "./devServer.js";
import queueMessage from "./queueMessage.js";

const command = new Command("dev").description("Run the development server");

export default command;

if (!process.env.QUEUE_RUN_INDENT) process.env.QUEUE_RUN_INDENT = "2";

const port = new Option("-p, --port <port>", "Port to run the server on")
  .env("PORT")
  .default(8000)
  .makeOptionMandatory();

command
  .command("start", { isDefault: true })
  .description("Start the development server (default command)")
  .addOption(port)
  .action(devServer);

command
  .command("queue")
  .description("Runs the job using queue handler")
  .argument("<queueName>", "The queue name")
  .argument(
    "[body]",
    'JSON or plain text (use @name to read from a file, "-" to read from stdin)'
  )
  .addOption(port)
  .option("-g --group <group>", "Group ID (FIFO queues only)")
  .action(queueMessage);

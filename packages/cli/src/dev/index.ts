import { Command, Option } from "commander";
import devServer from "./devServer.js";
import queueMessage from "./queueMessage.js";

const port = new Option("-p, --port <port>", "port to run the server on")
  .env("PORT")
  .default(8000)
  .makeOptionMandatory();

const command = new Command("dev")
  .description("run the development server")
  .addOption(port);

export default command;

command
  .command("start", { isDefault: true })
  .description("start the development server (default command)")
  .addOption(port)
  .action(devServer);

command
  .command("queue")
  .description("runs the job using queue handler")
  .argument("<queueName>", "the queue name")
  .argument(
    "[body]",
    'JSON or plain text (use @name to read from a file, "-" to read from stdin)'
  )
  .addOption(port)
  .option("-g --group <group>", "group ID (FIFO queues only)")
  .action(queueMessage);

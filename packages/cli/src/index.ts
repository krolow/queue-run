import { Command, Option } from "commander";
import ms from "ms";
import devServer from "./dev/devServer";
import pushMessage from "./dev/pushMessage";
const pkg = require("../package.json");

const program = new Command();

program.version(pkg.version);

const port = new Option("-p, --port <port>", "Port to run the server on")
  .env("PORT")
  .default(8001)
  .makeOptionMandatory();

const dev = program.command("dev");

dev
  .command("start", { isDefault: true })
  .description("Start the development server (default command)")
  .addOption(port)
  .action(devServer);

dev
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

dev
  .command("schedule", { hidden: true })
  .description("Run a scheduled job (dev server)")
  .argument("<jobName>", "The scheduled job name")
  .addOption(port)
  .action(async (jobName, options) => {
    console.log("run job", jobName, options);
  });

program.showSuggestionAfterError();
program.addHelpCommand();
program.configureHelp({
  sortSubcommands: true,
  sortOptions: true,
});
program
  .parseAsync(process.argv)
  .then(() => {
    if (process.stdout.isTTY)
      console.info("🌟 Done in %s", ms(process.uptime() * 1000));
    return undefined;
  })
  .catch((error) => {
    console.error(String(error));
    process.exit(1);
  });

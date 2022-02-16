import { Command, Option } from "commander";
import devServer from "../local/dev_server.js";
import loadEnvVars from "../local/load_env_vars.js";
import readPayload from "../shared/read_payload.js";

const portOption = new Option("-p, --port <port>", "port to run the server on")
  .env("PORT")
  .default(8000)
  .makeOptionMandatory();

const command = new Command("dev")
  .description("run the development server")
  .addOption(portOption)
  .option("-e, --env <env...>", "environment variables (format: name=value)")
  .addHelpText(
    "after",
    `\n
The development server loads environment variables from the file .env.
You can use --env to override these environment variables.
`
  )
  .action(async ({ port, env }: { port: number; env: string[] }) => {
    await loadEnvVars({ env, port, production: false });
    await devServer(port);
  });

command
  .command("schedule")
  .description("run a scheduled job")
  .argument("<name>", "the schedule name")
  .addOption(portOption)
  .action(async (name: string, { port }: { port: number }) => {
    const response = await fetch(
      new URL(`/$schedules/${name}`, `http://localhost:${port}`).href,
      { method: "POST" }
    );
    if (!response.ok)
      throw new Error(
        "Failed to run scheduled job — does this schedule exist?"
      );
  });

command
  .command("queue")
  .description("run a queued job")
  .argument("<queue>", "the queue name")
  .argument(
    "[payload]",
    'JSON or plain text (use @name to read from a file, "-" to read from stdin)'
  )
  .option("-g --group <group>", "group ID (FIFO queues only)")
  .addOption(portOption)
  .action(
    async (
      name: string,
      input: string | undefined,
      { group, port }: { group: string | undefined; port: number }
    ) => {
      await fetch(
        new URL(`/$schedules/${name}`, `http://localhost:${port}`).href,
        { method: "POST" }
      );
      const payload = await readPayload(input);
      if (!payload) throw new Error("Cannot queue empty message");

      const path = group ? `/$queues/${name}/${group}` : `/$queues/${name}`;
      const response = await fetch(
        new URL(path, `http://localhost:${port}`).href,
        { method: "POST", body: payload }
      );
      if (!response.ok)
        throw new Error("Failed to queue job — does this queue exist?");
    }
  );

export default command;

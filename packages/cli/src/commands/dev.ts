import { Command, Option } from "commander";
import loadEnvVars from "../local/load_env_vars.js";

const command = new Command("dev")
  .description("run the development server")
  .addOption(
    new Option("-p, --port <port>", "port to run the server on")
      .env("PORT")
      .default(8000)
      .makeOptionMandatory()
  )
  .addOption(
    new Option(
      "-e, --environment <environment...>",
      "environment variables (format: name=value)"
    ).default([])
  )
  .addHelpText(
    "after",
    `\n
The development server loads environment variables from the file .env.

The --environment option can be used to override these environment variables.
`
  )
  .action(
    async ({ port, environment }: { port: number; environment: string[] }) => {
      await loadEnvVars({ cliEnvVars: environment, port });
      process.env.PORT = port.toString();
      await import("../local/dev_server.js");
    }
  );

export default command;

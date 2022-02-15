import { Command, Option } from "commander";
import devServer from "../local/devServer.js";

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
      await devServer({ port, cliEnvVars: environment });
    }
  );

export default command;

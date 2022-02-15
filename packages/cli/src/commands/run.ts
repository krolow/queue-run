import { Command, Option } from "commander";
import ms from "ms";
import path from "node:path";
import {
  loadModule,
  socket,
  url,
  warmup,
  withExecutionContext,
} from "queue-run";
import { buildProject } from "queue-run-builder";
import { DevExecutionContext } from "../local/devContext.js";
import loadEnvVars from "../local/loadEnvVars.js";

const command = new Command("run")
  .description("run the file locally")
  .argument("<filename>", "filename to run")
  .addOption(
    new Option(
      "-e, --environment <environment...>",
      "environment variables (format: name=value)"
    ).default([])
  )
  .option("-t, --timeout <timeout>", 'timeout (eg "30s", "5m")', "5m")
  .addHelpText(
    "after",
    `\n
Loads environment variables from the file .env.
Use --environment to override these environment variables.
`
  )
  .action(
    async (
      filename: string,
      { environment, timeout }: { environment: string[]; timeout: string }
    ) => {
      const port = 8000;
      const sourceDir = process.cwd();
      const buildDir = path.resolve(".queue-run");

      await loadEnvVars({ sourceDir, cliEnvVars: environment, port });
      await buildProject({ buildDir, sourceDir });

      process.chdir(buildDir);
      url.baseUrl = process.env.QUEUE_RUN_URL;
      socket.url = process.env.QUEUE_RUN_WS;
      await warmup((args) => new DevExecutionContext({ port, ...args }));
      await withExecutionContext(
        new DevExecutionContext({ port, timeout: ms(timeout) }),
        async () => {
          const compiled = filename.replace(/\..*?$/, "");
          const loaded = await loadModule<
            { default?: () => Promise<void> },
            never
          >(compiled);
          if (!loaded) throw new Error(`Could not find ${filename}`);
          await loaded.module.default?.();
        }
      );
    }
  );

export default command;

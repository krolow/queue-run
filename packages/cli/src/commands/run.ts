import { Command, Option } from "commander";
import dotenv from "dotenv";
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
import { DevExecutionContext } from "../dev/devContext.js";

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
      setEnvVars(environment, port);
      const buildDir = path.resolve(".queue-run");
      await buildProject({ buildDir, sourceDir: process.cwd() });

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

async function setEnvVars(envVars: string[], port: number) {
  dotenv.config({ path: ".env" });

  for (const envVar of envVars) {
    const match = envVar.match(/^([^=]+)=(.*)$/)?.slice(1);
    if (!match)
      throw new Error('Environment variable must be in the form "name=value"');
    const [key, value] = match;
    process.env[key!] = value;
  }

  // @ts-ignore
  process.env.NODE_ENV = process.env.NODE_ENV ?? "development";
  // @ts-ignore
  process.env.QUEUE_RUN_ENV =
    process.env.NODE_ENV === "development" ? "development" : "production";
  // @ts-ignore
  process.env.QUEUE_RUN_INDENT = "2";
  // @ts-ignore
  process.env.QUEUE_RUN_URL = `http://localhost:${port}`;
  // @ts-ignore
  process.env.QUEUE_RUN_WS = `ws://localhost:${port}`;
}

export default command;

import { Command } from "commander";
import ms from "ms";
import path from "node:path";
import ora from "ora";
import {
  loadModule,
  socket,
  url,
  warmup,
  withExecutionContext,
} from "queue-run";
import {
  buildProject,
  getAPIGatewayURLs,
  getEnvVariables,
} from "queue-run-builder";
import { DevExecutionContext } from "../dev/dev_context.js";
import { loadCredentials } from "../shared/config.js";

const command = new Command("run");
command
  .command("local")
  .description("run the file locally")
  .argument("<filename>", "filename to run")
  .action(async (filename: string) => {
    const { name, awsRegion: region } = await loadCredentials();
    const buildDir = await buildCode();
    await loadEnvVars({ project: name, region });
    await runModule({ buildDir, filename });
  });

async function buildCode() {
  const sourceDir = process.cwd();
  const buildDir = path.resolve(".queue-run");
  await buildProject({ buildDir, sourceDir });
  return buildDir;
}

async function loadEnvVars({
  project,
  region,
}: {
  project: string;
  region: string;
}) {
  const spinner = ora("Loading environment variables").start();
  const envVars = await getEnvVariables({
    environment: "production",
    project,
    region,
  });
  const { httpUrl, wsUrl } = await getAPIGatewayURLs({ project, region });
  // These are not available in production unless you explicitly add as
  // environment variables
  delete process.env.AWS_ACCESS_KEY_ID;
  delete process.env.AWS_SECRET_ACCESS_KEY;

  Object.assign(process.env, Object.fromEntries(envVars.entries()));
  Object.assign(process.env, {
    NODE_ENV: "production",
    QUEUE_RUN_ENV: "production",
    QUEUE_RUN_INDENT: process.env.QUEUE_RUN_INDENT ?? "2",
    QUEUE_RUN_URL: httpUrl,
    QUEUE_RUN_WS: wsUrl,
  });
  spinner.succeed();
}

async function runModule({
  buildDir,
  filename,
}: {
  buildDir: string;
  filename: string;
}) {
  process.chdir(buildDir);

  url.baseUrl = process.env.QUEUE_RUN_URL;
  socket.url = process.env.QUEUE_RUN_WS;
  ora(`Running "${filename}"`).info();

  await warmup((args) => new DevExecutionContext(args));

  const result = await withExecutionContext(
    new DevExecutionContext({ timeout: ms("5m") }),
    async () => {
      const compiled = filename.replace(/\..*?$/, "");
      const loaded = await loadModule<
        { default?: () => Promise<unknown> },
        never
      >(compiled);
      if (!loaded) throw new Error(`Could not find ${filename}`);
      const handler = loaded.module.default;
      if (!handler)
        console.warn(
          'Filename "%s" does not export a default function',
          filename
        );
      return handler && (await handler());
    }
  );
  if (typeof result === "string") process.stdout.write(result);
  else if (result && typeof result === "object")
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

export default command;

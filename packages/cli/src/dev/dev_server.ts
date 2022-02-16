import dotenv from "dotenv";
import cluster from "node:cluster";
import path from "node:path";
import { URL } from "node:url";
import primary from "./primary.js";
import worker from "./worker.js";

if (cluster.isWorker) worker();

export default async function devServer({
  env,
  port,
}: {
  env: string[] | null;
  port: number;
}) {
  await loadEnvVars({ env, port });
  cluster.setupMaster({ exec: new URL(import.meta.url).pathname });
  primary(port);
}

/**
 * Load environment variables with the following precedence:
 *
 * 1. QueueRun environment variables
 * 2. Environment variables from the command line (`--env FOO=bar`)
 * 3. Environment variables from the shell (`export FOO=bar`)
 * 4. Environment variables from the file .env
 */
async function loadEnvVars({
  env,
  port,
}: {
  env: string[] | null;
  port: number;
}) {
  dotenv.config({ path: path.resolve(".env") });

  for (const envVar of env ?? []) {
    const match = envVar.match(/^([^=]+)=(.*)$/)?.slice(1);
    if (!match)
      throw new Error('Environment variable must be in the form "name=value"');
    const [key, value] = match;
    process.env[key!] = value!;
  }

  Object.assign(process.env, {
    NODE_ENV: "development",
    QUEUE_RUN_ENV: "development",
    QUEUE_RUN_INDENT: process.env.QUEUE_RUN_INDENT ?? "2",
    QUEUE_RUN_URL: `http://localhost:${port}`,
    QUEUE_RUN_WS: `ws://localhost:${port}`,
  });
}

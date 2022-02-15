import dotenv from "dotenv";
import path from "node:path";

/**
 * Load environment variables with the following precedence:
 *
 * 1. Environment variables from the file .env
 * 2. Environment variables from the shell (`export FOO=bar`)
 * 3. Environment variables from the command line (`--env FOO=bar`)
 * 4. QueueRun environment variables
 */
export default async function loadEnvVars({
  cliEnvVars,
  port,
}: {
  cliEnvVars: string[];
  port: number;
}) {
  dotenv.config({ path: path.resolve(".env") });

  for (const envVar of cliEnvVars) {
    const match = envVar.match(/^([^=]+)=(.*)$/)?.slice(1);
    if (!match)
      throw new Error('Environment variable must be in the form "name=value"');
    const [key, value] = match;
    process.env[key!] = value!;
  }

  Object.assign(process.env, {
    NODE_ENV: process.env.NODE_ENV ?? "development",
    QUEUE_RUN_ENV:
      process.env.NODE_ENV === "development" ? "development" : "production",
    QUEUE_RUN_INDENT: process.env.QUEUE_RUN_INDENT ?? "2",
    QUEUE_RUN_URL: `http://localhost:${port}`,
    QUEUE_RUN_WS: `ws://localhost:${port}`,
  });
}

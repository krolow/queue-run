import dotenv from "dotenv";
import fs from "node:fs/promises";
import path from "node:path";

export default async function loadEnvVars({
  sourceDir,
  cliEnvVars,
  port,
}: {
  sourceDir: string;
  cliEnvVars: string[];
  port: number;
}): Promise<{ [key: string]: string }> {
  const envVars = dotenv.parse(
    await fs.readFile(path.join(sourceDir, ".env"), "utf8").catch(() => "")
  );

  for (const cliArgument of cliEnvVars) {
    const match = cliArgument.match(/^([^=]+)=(.*)$/)?.slice(1);
    if (!match)
      throw new Error('Environment variable must be in the form "name=value"');
    const [key, value] = match;
    envVars[key!] = value!;
  }

  envVars.NODE_ENV = process.env.NODE_ENV ?? "development";
  envVars.QUEUE_RUN_ENV =
    process.env.NODE_ENV === "development" ? "development" : "production";
  envVars.QUEUE_RUN_INDENT = "2";
  envVars.QUEUE_RUN_URL = `http://localhost:${port}`;
  envVars.QUEUE_RUN_WS = `ws://localhost:${port}`;

  return envVars;
}

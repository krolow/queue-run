import path from "node:path";
import { socket, url, warmup } from "queue-run";
import { buildProject } from "queue-run-builder";
import { DevExecutionContext } from "./dev_context.js";
import loadEnvVars from "./load_env_vars.js";

export default async function runLocally(
  { env, port }: { env: string[]; port: number },
  callback: () => Promise<void>
) {
  const sourceDir = process.cwd();
  const buildDir = path.resolve(".queue-run");

  await loadEnvVars({ env, production: true, port });
  await buildProject({ buildDir, sourceDir });

  const cwd = process.cwd();
  process.chdir(buildDir);
  try {
    url.baseUrl = process.env.QUEUE_RUN_URL;
    socket.url = process.env.QUEUE_RUN_WS;

    await warmup((args) => new DevExecutionContext({ port, ...args }));
    await callback();
  } finally {
    process.chdir(cwd);
  }
}

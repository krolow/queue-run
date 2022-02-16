import cluster from "node:cluster";
import { URL } from "node:url";
import loadEnvVars from "./load_env_vars.js";
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
  await loadEnvVars({ env, port, production: false });
  cluster.setupMaster({ exec: new URL(import.meta.url).pathname });
  primary(port);
}

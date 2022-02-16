import cluster from "node:cluster";
import process from "node:process";
import { URL } from "node:url";
import primary from "./primary.js";
import worker from "./worker.js";

if (cluster.isWorker) worker(Number(process.env.PORT));

export default async function devServer(port: number) {
  cluster.setupMaster({
    exec: new URL(import.meta.url).pathname,
  });
  process.env.PORT = String(port);
  primary(port);
}

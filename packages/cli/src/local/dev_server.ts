import cluster from "node:cluster";
import process from "node:process";
import { URL } from "node:url";
import primary from "./primary.js";
import worker from "./worker.js";

const port = Number(process.env.PORT);
if (cluster.isWorker) worker(port);
else {
  cluster.setupMaster({
    exec: new URL(import.meta.url).pathname,
  });
  primary(port);
}

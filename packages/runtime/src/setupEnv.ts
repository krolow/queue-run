import { install } from "source-map-support";

function setupEnv() {
  process.env.NODE_ENV = "production";
  install({ environment: "node" });
}

setupEnv();

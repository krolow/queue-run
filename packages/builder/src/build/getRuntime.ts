import Lambda from "@aws-sdk/client-lambda";
import swc from "@swc/core";
import { R_OK } from "constants";
import fs from "fs/promises";
import path from "path";
import semver from "semver";

type RuntimeVersion = {
  // Primary Node version (12, 14, 16, etc)
  nodeVersion: "12" | "14";
  // Lambda runtime version, eg nodejs14.x
  lambdaRuntime: Lambda.Runtime;
  // Tell SWC which Node version to compile for
  jscTarget: swc.JscTarget;
};

// Returns the most suitable runtime version.
//
// For Node.js, consult with package.json engines.node field and pick the
// general Node version (14, 12, etc).
export default async function getRuntime(
  dirname: string
): Promise<RuntimeVersion> {
  const filename = path.join(dirname, "package.json");

  try {
    await fs.access(filename, R_OK);
  } catch {
    return defaultRuntime;
  }
  const packageJSON = JSON.parse(
    await fs.readFile(path.join(dirname, "package.json"), "utf8")
  );
  const specifiedEngine = packageJSON.engines?.node;
  if (!specifiedEngine) return defaultRuntime;

  for (const runtime of runtimes) {
    if (semver.satisfies(`${runtime.nodeVersion}.0.0`, specifiedEngine))
      return runtime;
  }
  throw new Error(
    `package.json specifies unsupported Node engine ${specifiedEngine}`
  );
}

const runtimes: Array<{
  nodeVersion: "12" | "14";
  lambdaRuntime: Lambda.Runtime;
  jscTarget: swc.JscTarget;
}> = [
  {
    nodeVersion: "14",
    jscTarget: "es2020",
    lambdaRuntime: Lambda.Runtime.nodejs14x,
  },
  {
    nodeVersion: "12",
    jscTarget: "es3",
    lambdaRuntime: Lambda.Runtime.nodejs12x,
  },
];

const defaultRuntime = runtimes[0]!;

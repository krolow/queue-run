import { JscTarget } from "@swc/core";
import { readFile } from "fs/promises";
import path from "path";
import semver from "semver";

// Returns the most suitable runtime version.
//
// For Node.js, consult with package.json engines.node field and pick the
// general Node version (14, 12, etc).
export default async function getRuntime(dirname: string): Promise<{
  // Primary Node version (12, 14, 16, etc)
  nodeVersion: "12" | "14";
  // Lambda runtime version, eg nodejs14.x
  // 2021-12-06: keyof typeof Runtime has "nodejs14x", but Lambda expects "nodejs14.x"  ¯\_(ツ)_/¯
  lambdaRuntime: string;
  // Tell SWC which Node version to compile for
  jscTarget: JscTarget;
}> {
  const packageJSON = JSON.parse(
    await readFile(path.join(dirname, "package.json"), "utf8")
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
  lambdaRuntime: string;
  jscTarget: JscTarget;
}> = [
  { nodeVersion: "14", jscTarget: "es2020", lambdaRuntime: "nodejs14.x" },
  { nodeVersion: "12", jscTarget: "es3", lambdaRuntime: "nodejs12.x" },
];

const defaultRuntime = runtimes[0];

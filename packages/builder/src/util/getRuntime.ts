import { Runtime } from "@aws-sdk/client-lambda";
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
  lambdaRuntime: keyof typeof Runtime;
  // Tell SWC which Node version to compile for
  jscTarget: JscTarget;
}> {
  const packageJSON = JSON.parse(
    await readFile(path.join(dirname, "package.json"), "utf8")
  );
  const specifiedEngine = packageJSON.engines?.node;
  if (!specifiedEngine)
    return {
      ...defaultRuntime,
      lambdaRuntime: `nodejs${defaultRuntime.nodeVersion}x`,
    };

  for (const runtime of runtimes) {
    if (semver.satisfies(`${runtime.nodeVersion}.0.0`, specifiedEngine))
      return { ...runtime, lambdaRuntime: `nodejs${runtime.nodeVersion}x` };
  }
  throw new Error(
    `package.json specifies unsupported Node engine ${specifiedEngine}`
  );
}

const runtimes: Array<{
  nodeVersion: "12" | "14";
  jscTarget: JscTarget;
}> = [
  { nodeVersion: "14", jscTarget: "es2020" },
  { nodeVersion: "12", jscTarget: "es3" },
];

const defaultRuntime = runtimes[0];

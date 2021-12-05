import * as swc from "@swc/core";
import { JscTarget } from "@swc/core";
import glob from "fast-glob";
import { copyFile, mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import getRuntimeVersion from "../util/getRuntime";

export default async function compileSourceFiles({
  envVars,
  sourceDir,
  targetDir,
}: {
  envVars: Record<string, string>;
  sourceDir: string;
  targetDir: string;
}) {
  console.info("λ: Building %s …", targetDir);

  const { jscTarget, nodeVersion } = await getRuntimeVersion(sourceDir);
  console.info("λ: Compiling source code for Node %s", nodeVersion);

  const ignore = (
    await readFile(path.join(sourceDir, ".gitignore"), "utf-8").catch(() => "")
  )
    .split("\n")
    .filter((line) => line.trim().length > 0 && !line.startsWith("#"));

  const filenames = glob.sync("**/*", {
    cwd: sourceDir,
    followSymbolicLinks: true,
    ignore: [...ignore, "**/node_modules/**"],
    markDirectories: true,
    unique: true,
  });
  let compiled = 0;
  let copied = 0;
  for (const filename of filenames) {
    const dest = path.join(targetDir, path.relative(sourceDir, filename));
    if (filename.endsWith("/")) {
      await mkdir(dest, { recursive: true });
    } else {
      await mkdir(path.dirname(dest), { recursive: true });
      if (/\.(js|ts)$/.test(filename)) {
        await compileSourceFile({ filename, dest, envVars, jscTarget });
        compiled++;
      } else {
        await copyFile(filename, dest);
        copied++;
      }
    }
  }

  console.info("λ: Compiled %d files and copied %d files", compiled, copied);
  const entryPoints = glob.sync("background/*/[!_]*.{ts,js}", {
    cwd: sourceDir,
  });
  if (entryPoints.length === 0) throw new Error("No entry points found");
  console.info(
    "λ: Entry points:\n%s",
    entryPoints.map((filename) => `   ${filename}`).join("\n")
  );
}

// We compile TypeScript to JavaScript, but also compile latest ECMAScript to
// whatever version is supported by the runtime.
async function compileSourceFile({
  dest,
  envVars,
  filename,
  jscTarget,
}: {
  dest: string;
  envVars: Record<string, string>;
  filename: string;
  jscTarget: JscTarget;
}) {
  const syntax = filename.endsWith(".ts") ? "typescript" : "ecmascript";
  const { code, map } = await swc.transformFile(filename, {
    envName: process.env.NODE_ENV,
    jsc: {
      parser: { syntax },
      target: jscTarget,
      transform: { optimizer: { globals: { vars: envVars } } },
    },
    sourceMaps: true,
    module: { type: "commonjs", noInterop: true },
  });
  await writeFile(dest.replace(/\.ts$/, ".js"), code, "utf-8");
  if (map) await writeFile(dest.replace(/\.ts$/, ".js.map"), map, "utf-8");
}

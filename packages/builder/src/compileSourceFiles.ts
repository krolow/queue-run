import swc from "@swc/core";
import glob from "fast-glob";
import fs from "fs/promises";
import path from "path";
import getRuntimeVersion from "./getRuntime";

export default async function compileSourceFiles({
  sourceDir,
  targetDir,
}: {
  sourceDir: string;
  targetDir: string;
}) {
  console.info("λ: Building %s …", targetDir);

  const { jscTarget, nodeVersion } = await getRuntimeVersion(sourceDir);
  console.info("λ: Compiling source code for Node %s", nodeVersion);

  const ignore = (
    await fs
      .readFile(path.join(sourceDir, ".gitignore"), "utf-8")
      .catch(() => "")
  )
    .split("\n")
    .filter((line) => line.trim().length > 0 && !line.startsWith("#"));

  const filenames = glob.sync("**/*", {
    absolute: true,
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
      await fs.mkdir(dest, { recursive: true });
    } else {
      await fs.mkdir(path.dirname(dest), { recursive: true });
      if (/\.(js|ts)$/.test(filename)) {
        await compileSourceFile({ filename, dest, jscTarget });
        compiled++;
      } else {
        await fs.copyFile(filename, dest);
        copied++;
      }
    }
  }

  console.info("λ: Compiled %d files and copied %d files", compiled, copied);
}

// We compile TypeScript to JavaScript, but also compile latest ECMAScript to
// whatever version is supported by the runtime.
async function compileSourceFile({
  dest,
  filename,
  jscTarget,
}: {
  dest: string;
  filename: string;
  jscTarget: swc.JscTarget;
}) {
  const syntax = filename.endsWith(".ts") ? "typescript" : "ecmascript";
  const { code, map } = await swc.transformFile(filename, {
    envName: process.env.NODE_ENV,
    jsc: { parser: { syntax }, target: jscTarget },
    module: { type: "commonjs" },
    sourceMaps: true,
    swcrc: false,
  });
  await fs.writeFile(dest.replace(/\.ts$/, ".js"), code, "utf-8");
  if (map) await fs.writeFile(dest.replace(/\.ts$/, ".js.map"), map, "utf-8");
}

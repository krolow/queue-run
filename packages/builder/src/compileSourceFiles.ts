import * as swc from "@swc/core";
import glob from "fast-glob";
import { copyFile, mkdir, readFile, writeFile } from "fs/promises";
import ms from "ms";
import path from "path";
import getEnvVariables from "./getEnvVariables";

export default async function compileSourceFiles({
  sourceDir,
  targetDir,
}: {
  sourceDir: string;
  targetDir: string;
}) {
  const start = Date.now();
  console.info("λ: Building %s", targetDir);

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
  for (const filename of filenames) {
    const dest = path.join(targetDir, path.relative(sourceDir, filename));
    if (filename.endsWith("/")) {
      await mkdir(dest, { recursive: true });
    } else {
      await mkdir(path.dirname(dest), { recursive: true });
      if (filename.endsWith(".ts")) await compileTypeScript(filename, dest);
      else await copyFile(filename, dest);
    }
  }

  console.info("✨  Done in %s.", ms(Date.now() - start));
}

async function compileTypeScript(filename: string, dest: string) {
  const { code, map } = await swc.transformFile(filename, {
    envName: process.env.NODE_ENV,
    env: { targets: { node: 14 } },
    jsc: {
      parser: { syntax: "typescript" },
      transform: { optimizer: { globals: { vars: getEnvVariables() } } },
    },
    sourceMaps: true,
    module: { type: "commonjs", noInterop: true },
  });
  await writeFile(dest.replace(/\.ts$/, ".js"), code, "utf-8");
  if (map) await writeFile(dest.replace(/\.ts$/, ".js.map"), map, "utf-8");
}

import * as swc from "@swc/core";
import { statSync } from "fs";
import { copyFile, mkdir, writeFile } from "fs/promises";
import glob from "glob";
import path from "path";

export default async function compileSourceFiles(
  sourceDir: string,
  targetDir: string
) {
  await copyFile(
    path.resolve(sourceDir, "package.json"),
    path.resolve(targetDir, "package.json")
  );
  await copySourceFiles(sourceDir, targetDir);
  await compileTypeScript(sourceDir, targetDir);
}

async function copySourceFiles(sourceDir: string, targetDir: string) {
  const sources = glob
    .sync(path.join(sourceDir, "{background,lib}", "**", "*"))
    .filter((source) => !source.endsWith(".ts"))
    .filter((source) => !statSync(source).isDirectory());
  for (const source of sources) {
    const dest = path.join(targetDir, path.relative(sourceDir, source));
    await mkdir(path.dirname(dest), { recursive: true });
    await copyFile(source, dest);
  }
}

async function compileTypeScript(sourceDir: string, targetDir: string) {
  const sources = glob.sync(
    path.join(sourceDir, "{background,lib}", "**", "*.ts")
  );
  for (const source of sources) {
    const { code, map } = await swc.transformFile(source, {
      envName: process.env.NODE_ENV,
      env: { targets: { node: 14 } },
      jsc: { parser: { syntax: "typescript" } },
      sourceMaps: true,
      module: { type: "commonjs", noInterop: true },
    });
    const dest = path.join(targetDir, path.relative(sourceDir, source));
    await writeFile(dest.replace(/\.ts$/, ".js"), code, "utf-8");
    if (map) await writeFile(dest.replace(/\.ts$/, ".js.map"), map, "utf-8");
  }
}

import { existsSync } from "fs";
import { copyFile } from "fs/promises";
import path from "path";
import compileSourceFiles from "./compileSourceFiles";
import createBuildDirectory from "./createBuildDirectory";
import installDependencies from "./installDependencies";

const targetDir = path.resolve(".build");
const sourceDir = path.resolve(".");

export async function nakedBuild() {
  await createBuildDirectory(targetDir);
  await compileSourceFiles({ sourceDir, targetDir });
}

export async function fullBuild() {
  await createBuildDirectory(targetDir);
  copyPackageJSON(sourceDir, targetDir);
  await installDependencies(targetDir);
  await compileSourceFiles({ sourceDir, targetDir });
}

async function copyPackageJSON(sourceDir: string, targetDir: string) {
  const source = path.resolve(sourceDir, "package.json");
  const dest = path.resolve(targetDir, "package.json");
  if (!existsSync(source)) throw new Error("Missing package.json");
  await copyFile(source, dest);
}

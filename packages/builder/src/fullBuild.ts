import { existsSync } from "fs";
import { copyFile } from "fs/promises";
import path from "path";
import compileSourceFiles from "./compileSourceFiles";
import createBuildDirectory from "./createBuildDirectory";
import installDependencies from "./installDependencies";

export default async function fullBuild({
  sourceDir,
  buildDir,
}: {
  sourceDir: string;
  buildDir: string;
}) {
  await createBuildDirectory(buildDir);
  await copyPackageJSON(sourceDir, buildDir);
  await installDependencies(buildDir);
  console.info();

  await compileSourceFiles({ sourceDir, targetDir: buildDir });
}

async function copyPackageJSON(sourceDir: string, targetDir: string) {
  const source = path.resolve(sourceDir, "package.json");
  const dest = path.resolve(targetDir, "package.json");
  if (!existsSync(source)) throw new Error("Missing package.json");
  await copyFile(source, dest);
}

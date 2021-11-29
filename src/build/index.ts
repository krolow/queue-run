import path from "path";
import compileSourceFiles from "./compileSourceFiles";
import createBuildDirectory from "./createBuildDirectory";
import installDependencies from "./installDependencies";

const targetDir = path.resolve(".build");
const sourceDir = path.resolve(".");

export async function naked() {
  await createBuildDirectory(targetDir);
  await compileSourceFiles(sourceDir, targetDir);
}

export async function full() {
  await naked();
  await installDependencies(targetDir);
}

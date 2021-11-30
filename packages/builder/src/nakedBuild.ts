import path from "path";
import compileSourceFiles from "./compileSourceFiles";
import { buildDir } from "./constants";
import createBuildDirectory from "./createBuildDirectory";

export default async function nakedBuild() {
  const sourceDir = path.resolve(".");
  await createBuildDirectory(buildDir);
  await compileSourceFiles({ sourceDir, targetDir: buildDir });
}

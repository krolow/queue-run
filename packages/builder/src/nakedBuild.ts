import compileSourceFiles from "./compileSourceFiles";
import createBuildDirectory from "./createBuildDirectory";

export default async function nakedBuild({
buildDir, sourceDir}: { buildDir: string; sourceDir: string }) {
 ) {
  await createBuildDirectory(buildDir);
  await compileSourceFiles({ sourceDir, targetDir: buildDir });
}

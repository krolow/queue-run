import { mkdir } from "fs/promises";
import ms from "ms";
import rimraf from "rimraf";
import compileSourceFiles from "./compileSourceFiles";
import installDependencies from "./installDependencies";

export default async function fullBuild({
  install,
  sourceDir,
  targetDir,
}: {
  install: boolean;
  sourceDir: string;
  targetDir: string;
}) {
  await createBuildDirectory(targetDir);
  const start = Date.now();
  await compileSourceFiles({ sourceDir, targetDir });
  console.info("✨  Done in %s.", ms(Date.now() - start));

  if (install) await installDependencies({ sourceDir, targetDir });
}

async function createBuildDirectory(targetDir: string) {
  rimraf.sync(targetDir);
  await mkdir(targetDir);
}

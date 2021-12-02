import { createHash } from "crypto";
import glob from "fast-glob";
import { existsSync, readFileSync } from "fs";
import { copyFile } from "fs/promises";
import ms from "ms";
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

  const start = Date.now();
  await compileSourceFiles({ sourceDir, targetDir: buildDir });
  const buildId = await generateBuildId(buildDir);
  console.info("λ: Build %s", buildId);
  console.info("✨  Done in %s.", ms(Date.now() - start));
  return buildId;
}

async function copyPackageJSON(sourceDir: string, targetDir: string) {
  const source = path.resolve(sourceDir, "package.json");
  const dest = path.resolve(targetDir, "package.json");
  if (!existsSync(source)) throw new Error("Missing package.json");
  await copyFile(source, dest);
}

async function generateBuildId(dirname: string) {
  const filenames = glob.sync("**/*", {
    cwd: dirname,
    onlyFiles: true,
    unique: true,
  });
  const hash = filenames
    .sort()
    .reduce(
      (hash, filename) =>
        hash.update(readFileSync(path.resolve(dirname, filename), "utf8")),
      createHash("sha256")
    );
  return hash.digest("hex").slice(0, 16);
}

import fs from "node:fs/promises";

export default async function createBuildDirectory(targetDir: string) {
  await fs.rm(targetDir, { force: true, recursive: true });
  await fs.mkdir(targetDir);
}

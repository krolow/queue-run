import { mkdir } from "fs/promises";
import rimraf from "rimraf";

export default async function createBuildDirectory(targetDir: string) {
  rimraf.sync(targetDir);
  await mkdir(targetDir);
}

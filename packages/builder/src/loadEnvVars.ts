import dotenv from "dotenv";
import { readFile } from "fs/promises";
import path from "path";

export default async function loadEnvVars(dirname: string) {
  const dotEnv = await readFile(path.resolve(dirname, ".env"), "utf8").catch(
    () => ""
  );
  return dotenv.parse(dotEnv);
}

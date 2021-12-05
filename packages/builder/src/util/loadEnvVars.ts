import dotenv from "dotenv";
import { readFile } from "fs/promises";
import path from "path";

export default async function loadEnvVars(dirname: string) {
  const dotEnv = await readFile(path.resolve(dirname, ".env"), "utf8").catch(
    () => ""
  );
  const envVars = dotenv.parse(dotEnv);
  return {
    ...envVars,
    NODE_ENV: envVars.NODE_ENV ?? process.env.NODE_ENV ?? "development",
  };
}

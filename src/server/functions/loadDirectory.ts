import { existsSync } from "fs";
import * as fs from "fs/promises";
import * as path from "path";
import * as vm from "vm";
import loadModule from "./loadModule";

export default async function loadDirectory({
  dirname,
  global,
  watch,
}: {
  dirname: string;
  global: vm.Context;
  watch: boolean;
}) {
  const filenames = await listFilenames(dirname);
  const nameModulePairs = await Promise.all(
    filenames.map(async (filename) => {
      const name = path.basename(filename, path.extname(filename));
      const module = await loadModule({ filename, global, watch });
      return [name, module] as [string, typeof module];
    })
  );
  return new Map(nameModulePairs);
}

async function listFilenames(dirname: string): Promise<string[]> {
  if (!existsSync(dirname)) return [];

  const filenames = await fs.readdir(dirname);
  const onlyScripts = filenames
    .filter((filename) => filename.endsWith(".ts") || filename.endsWith(".js"))
    .filter((filename) => !filename.startsWith("_"));
  const notAllowed = onlyScripts.find(
    (filename) => !/^[a-zA-Z0-9_-]+.(js|ts)$/.test(path.basename(filename))
  );
  if (notAllowed) {
    throw new Error(
      `Filename can only contain alphanumeric, hyphen, or underscore (${notAllowed})`
    );
  }
  return onlyScripts.map((filename) => path.join(dirname, filename));
}

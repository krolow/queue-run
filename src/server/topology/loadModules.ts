import * as swc from "@swc/core";
import chokidar from "chokidar";
import { existsSync } from "fs";
import * as fs from "fs/promises";
import * as path from "path";
import * as vm from "vm";

type Module = {
  handler: () => Promise<void> | void;
  config?: Record<string, unknown>;
};

export default async function loadModules(
  dirname: string,
  watch: boolean
): Promise<Map<string, Module>> {
  const filenames = await listFilenames(dirname);
  const map = await Promise.all(
    filenames.map(async (filename) => {
      const name = path.basename(filename, path.extname(filename));
      const module = await loadModule(filename, watch);
      return [name, module] as [string, Module];
    })
  );
  return new Map(map);
}

async function loadModule(filename: string, watch: boolean): Promise<Module> {
  const module = await loadScript(filename);

  if (watch) {
    const watcher = chokidar.watch(filename, {
      persistent: true,
      ignoreInitial: true,
    });
    watcher.on("change", async () => {
      console.log(`Reloading ${filename}`);
      try {
        const { config, handler } = await loadScript(filename);
        Object.assign(module, { config, handler });
      } catch (error) {
        console.error("Error loading %s", filename, error.stack);
      }
    });
  }
  return module;
}

async function listFilenames(dirname: string): Promise<string[]> {
  if (!(await existsSync(dirname))) return [];
  const filenames = await fs.readdir(dirname);
  const onlyScripts = filenames
    .filter((filename) => filename.endsWith(".ts") || filename.endsWith(".js"))
    .filter((filename) => !filename.startsWith("_"));
  const notAllowed = onlyScripts.find(
    (filename) => !/^[a-zA-Z0-9_\-]+.(js|ts)$/.test(path.basename(filename))
  );
  if (notAllowed)
    throw new Error(
      `File name can only contain alphanumeric, hyphen, or underscore (${notAllowed})`
    );
  return onlyScripts.map((filename) => path.join(dirname, filename));
}

async function loadScript(filename: string): Promise<Module> {
  const source = await readScript(filename);
  const script = new vm.Script(source, { filename });
  const context = vm.createContext({ exports: {}, console });
  script.runInContext(context);
  const handler = context.exports.default;
  if (typeof handler !== "function")
    throw new Error(`Expected ${filename} to export a default function`);
  const { config } = context.exports;
  return { config, handler };
}

async function readScript(filename: string): Promise<string> {
  const source = await fs.readFile(filename, "utf8");
  if (filename.endsWith(".js")) return source;

  const { code } = await swc.transform(source, {
    filename,
    sourceMaps: true,
    module: { type: "commonjs" },
  });
  return code;
}

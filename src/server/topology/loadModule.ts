import * as swc from "@swc/core";
import chokidar from "chokidar";
import * as fs from "fs/promises";
import * as vm from "vm";

type Module = {
  handler: () => Promise<void> | void;
  config?: Record<string, unknown>;
};

export async function loadModule(
  filename: string,
  watch: boolean
): Promise<Module> {
  const module = await loadModuleOnce(filename);

  if (watch) {
    const watcher = chokidar.watch(filename, { ignoreInitial: true });
    watcher.on("change", async () => {
      console.info(`Reloading ${filename}`);
      try {
        Object.assign(module, await loadModuleOnce(filename));
      } catch (error) {
        console.error("Error loading %s", filename, (error as Error).stack);
      }
    });
  }
  return module;
}

async function loadModuleOnce(filename: string): Promise<Module> {
  const source = await loadAsJavaScript(filename);
  const script = new vm.Script(source, { filename });
  const context = vm.createContext({ exports: {}, console });
  script.runInContext(context);

  const handler = context.exports.default;
  if (typeof handler !== "function")
    throw new Error(`Expected ${filename} to export a default function`);

  const { config } = context.exports;
  return { config, handler };
}

async function loadAsJavaScript(filename: string): Promise<string> {
  const source = await fs.readFile(filename, "utf8");
  if (filename.endsWith(".js")) return source;

  const { code } = await swc.transform(source, {
    filename,
    sourceMaps: true,
    module: { type: "commonjs" },
  });
  return code;
}

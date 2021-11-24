import chokidar from "chokidar";
import * as vm from "vm";
import { compile } from "./compile";

type Module = {
  // Exported from module, depends on module type
  config: Record<string, unknown>;
  // Last error, only used when reloading
  error?: Error;
  // The filename of the module
  filename: string;
  // Exported from module, depends on module type
  handler: () => Promise<void> | void;
  // Paths for all files that are watched
  paths: string[];
};

export default async function loadModule({
  filename,
  global,
  watch,
}: {
  filename: string;
  global: vm.Context;
  watch: boolean;
}): Promise<Readonly<Module>> {
  const sourceMaps = new Map<string, string>();
  const module = await loadEntryPoint({ filename, global, sourceMaps });

  if (watch) {
    const watcher = chokidar.watch(module.paths, { ignoreInitial: true });
    watcher.on("change", async (changed) => {
      console.debug("File %s changed, reloading %s", changed, filename);
      try {
        const watched = module.paths;

        Object.assign(
          module,
          await loadEntryPoint({ filename, global, sourceMaps })
        );
        delete module.error;

        watcher.unwatch(watched);
        watcher.add(module.paths);
      } catch (error) {
        console.error("Error loading %s", filename, (error as Error).stack);
        module.error = error as Error;
      }
    });
  }

  return module;
}

async function loadEntryPoint({
  filename,
  global,
  sourceMaps,
}: {
  filename: string;
  global: vm.Context;
  sourceMaps: Map<string, string>;
}): Promise<Module> {
  const start = Date.now();

  const cache = {} as NodeJS.Dict<NodeJS.Module>;
  const module = await compile({ cache, id: filename, global, sourceMaps });
  console.dir(module);
  const { config, default: handler } = module.exports;
  if (typeof handler !== "function")
    throw new Error(`Expected ${filename} to export a default function`);

  console.debug("Loaded module %s in %dms", filename, Date.now() - start);
  const paths = Object.keys(cache);

  return { config, filename, handler, paths };
}

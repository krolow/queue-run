import * as swc from "@swc/core";
import chokidar from "chokidar";
import * as fs from "fs";
import * as path from "path";
import * as vm from "vm";

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
  const module = await loadEntryPoint({ filename, global });

  if (watch) {
    const watcher = chokidar.watch(module.paths, { ignoreInitial: true });
    watcher.on("change", async (changed) => {
      console.debug("File %s changed, reloading %s", changed, filename);
      try {
        const watched = module.paths;
        Object.assign(module, await loadEntryPoint({ filename, global }));
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
}: {
  filename: string;
  global: vm.Context;
}): Promise<Module> {
  const start = Date.now();

  const modules = new Map<string, unknown>();
  const cache = {} as NodeJS.Dict<NodeJS.Module>;
  const { config, default: handler } = await compileAndExport({
    cache,
    filename,
    global,
    modules,
  });
  if (typeof handler !== "function")
    throw new Error(`Expected ${filename} to export a default function`);

  console.debug("Loaded module %s in %dms", filename, Date.now() - start);
  const paths = [...modules.keys()];

  return { config, filename, handler, paths };
}

const globalRequire = require;

function compileAndExport({
  cache,
  filename,
  global,
}: {
  cache: NodeJS.Dict<NodeJS.Module>;
  filename: string;
  global: vm.Context;
}) {
  const cached = {
    exports: {},
    filename,
    loaded: false,
    require,
  } as NodeJS.Module;
  cache[filename] = cached;

  const { code } = swc.transformFileSync(filename, {
    envName: process.env.NODE_ENV,
    env: { targets: { node: process.versions.node } },
    jsc: {
      parser: {
        syntax: filename.endsWith(".ts") ? "typescript" : "ecmascript",
      },
      transform: { optimizer: { globals: { envs: ["NODE_ENV"] } } },
    },
    module: { type: "commonjs" },
  });

  function require(requirePath: string) {
    const existing = cache[requirePath]?.exports;
    if (existing) return existing;

    if (requirePath.startsWith(".")) {
      return compileAndExport({
        cache,
        filename: require.resolve(requirePath),
        global,
      });
    } else return globalRequire(requirePath);
  }

  require.resolve = (requirePath: string) => {
    const fullPath = path.resolve(path.dirname(filename), requirePath);
    const found = [".ts", "/index.ts", ".js", "/index.js"]
      .map((ext) => `${fullPath}${ext}`)
      .find((path) => fs.existsSync(path));
    if (!found) throw new Error(`Cannot find module '${requirePath}'`);
    return found;
  };

  const script = new vm.Script(code, {
    displayErrors: true,
    filename,
  });
  const context = vm.createContext({ ...global, require, exports: {} });
  script.runInContext(context, { breakOnSigint: true, displayErrors: true });
  const exports = context.exports;

  cached.exports = exports;
  cached.loaded = true;
  return exports;
}

import * as swc from "@swc/core";
import { R_OK } from "constants";
import * as fs from "fs";
import { lstat } from "fs/promises";
import Module from "module";
import { AbortController } from "node-abort-controller";
import * as path from "path";
import sourceMapSupport from "source-map-support";
import vm from "vm";

const globalRequire = require;

let cache: Record<string, Module> = {};
let sourceMaps = new Map<string, string>();
let abortWatch = new AbortController();

const extensions = {
  ...globalRequire.extensions,
  ".json": (module: Module, filename: string) => {
    module.exports.default = JSON.parse(
      fs.readFileSync(require.resolve(filename), "utf8")
    );
  },
  ".js": compileSourceFile({
    sourceMaps,
    syntax: "ecmascript",
  }),
  ".ts": compileSourceFile({
    sourceMaps,
    syntax: "typescript",
  }),
};

// Half-assed implementatio of Node's require module loading that support hot reload.
export default function loadModule(filename: string, parent?: Module): Module {
  const found = findActualFile(filename);
  if (!found) {
    const error = new Error(`Cannot resolve file '${filename}'`);
    // @ts-ignore
    error.code = "ERR_MODULE_NOT_FOUND";
    throw error;
  }
  filename = found;

  const require: typeof globalRequire = (id: string) => {
    if (id.startsWith(".")) {
      const child = cache[id] ?? loadModule(require.resolve(id), module);
      if (!module.children.find(({ id }) => id === child.id))
        module.children.push(child);
      return child.exports;
    } else {
      const fromNodeModule = requireFromNodeModules(
        filename,
        require.resolve.paths(filename)
      );
      if (fromNodeModule) return fromNodeModule;
      else return globalRequire(id);
    }
  };

  require.cache = cache;
  require.main = undefined;
  require.extensions = extensions;

  const resolve = (id: string) => {
    const fullPath = path.resolve(path.dirname(module.filename), id);
    const found = findActualFile(fullPath);
    return found ?? globalRequire.resolve(id);
  };
  resolve.paths = (id: string) => nodeModulePaths(id);
  require.resolve = resolve;

  const module: Module = {
    children: [],
    exports: {},
    filename,
    id: filename,
    isPreloading: false,
    loaded: false,
    parent,
    path: path.dirname(filename),
    paths: parent?.paths ?? globalRequire.resolve.paths("") ?? [],
    require,
  };
  cache[filename] = module;

  fs.watch(
    filename,
    { signal: abortWatch.signal },
    onFileChanged.bind(null, filename, abortWatch)
  );

  const extension = require.extensions[path.extname(filename)];
  if (!extension) throw new Error(`Unsupported extension: ${filename}`);
  extension(module, filename);
  module.loaded = true;
  return module;
}

sourceMapSupport.install({
  environment: "node",
  retrieveSourceMap: (filename) => {
    const map = sourceMaps.get(filename);
    return map ? { url: filename, map } : null;
  },
});

function findActualFile(filename: string) {
  return [
    "",
    ...Object.keys(extensions),
    ...Object.keys(extensions).map((ext) => `/index${ext}`),
  ]
    .map((ext) => `${filename}${ext}`)
    .find((path) => {
      try {
        return fs.lstatSync(path).isFile();
      } catch {
        return false;
      }
    });
}

function onFileChanged(filename: string, controller: AbortController) {
  if (controller.signal.aborted) return;

  console.info("♻️ File %s changed, reloading", filename);
  controller.abort();
  cache = {};
  sourceMaps = new Map();
  abortWatch = new AbortController();
}

function requireFromNodeModules(filename: string, paths: string[] | null) {
  if (!paths) return null;
  const found = paths
    .map((dir) => path.resolve(dir, filename))
    .find((path) => lstat(path).catch(() => false));
  return found ? require(found) : null;
}

function nodeModulePaths(filename: string): string[] | null {
  if (filename.startsWith(".")) return null;
  const dirname = path.dirname(filename);
  const paths = [];
  try {
    fs.accessSync(path.resolve(dirname, "package.json"), R_OK);
    paths.push(path.resolve(dirname, "node_modules"));
  } catch {
    // No package.json
  }
  if (dirname === "/" || dirname === process.cwd()) return paths;
  const parent = nodeModulePaths(path.dirname(dirname));
  return parent ? [...parent, ...paths] : paths;
}

function compileSourceFile({
  sourceMaps,
  syntax,
}: {
  sourceMaps: Map<string, string>;
  syntax: "typescript" | "ecmascript";
}) {
  return (module: Module, filename: string) => {
    const { code, map: sourceMap } = swc.transformFileSync(filename, {
      envName: process.env.NODE_ENV,
      jsc: { parser: { syntax }, target: "es2020" },
      module: { type: "commonjs", noInterop: true },
      sourceMaps: true,
      swcrc: false,
    });
    if (sourceMap) sourceMaps.set(filename, sourceMap);

    vm.compileFunction(
      code,
      ["exports", "require", "module", "__filename", "__dirname", "process"],
      {
        filename,
      }
    )(
      module.exports,
      module.require,
      module,
      filename,
      path.dirname(filename),
      process
    );
    module.loaded = true;
  };
}

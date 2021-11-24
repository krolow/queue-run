import * as swc from "@swc/core";
import * as fs from "fs";
import * as path from "path";
import * as vm from "vm";

const globalRequire = require;

// Half-assed implementatio of Node's require module loading that supports TypeScript.
export function compile({
  cache,
  global,
  id,
  parent,
  sourceMaps,
}: {
  cache: NodeJS.Dict<NodeJS.Module>;
  global: vm.Context;
  id: string;
  parent?: NodeJS.Module;
  sourceMaps: Map<string, string>;
}): NodeJS.Module {
  const require: NodeJS.Require = (id: string) => {
    if (!id.startsWith(".")) return globalRequire(id);
    const child =
      cache[id] ??
      compile({
        cache,
        global,
        id: require.resolve(id),
        parent: module,
        sourceMaps,
      });
    if (!module.children.find(({ id }) => id === child.id))
      module.children.push(child);
    return child.exports;
  };

  require.cache = cache;
  require.main = undefined;
  require.extensions = globalRequire.extensions;

  const resolve: NodeJS.RequireResolve = (id: string) => {
    const fullPath = path.resolve(path.dirname(module.filename), id);
    const found = [".ts", "/index.ts", ".js", "/index.js", ".json", ""]
      .map((ext) => `${fullPath}${ext}`)
      .find((path) => fs.existsSync(path));
    return found ?? globalRequire.resolve(id);
  };
  resolve.paths = globalRequire.resolve.paths;
  require.resolve = resolve;

  const module: NodeJS.Module = {
    children: [],
    exports: {},
    filename: id,
    id,
    isPreloading: false,
    loaded: false,
    parent,
    path: path.dirname(id),
    paths: parent?.paths ?? [],
    require,
  };
  cache[id] = module;

  require.extensions[".ts"] = (module, filename) => {};

  const extension = require.extensions[path.extname(id)];
  if (extension) {
    extension(module, id);
    module.loaded = true;
    return module;
  }

  const { code, map: sourceMap } = swc.transformFileSync(id, {
    envName: process.env.NODE_ENV,
    env: { targets: { node: process.versions.node } },
    jsc: {
      parser: {
        syntax: id.endsWith(".ts") ? "typescript" : "ecmascript",
      },
      // transform: { optimizer: { globals: { envs: ["NODE_ENV"] } } },
    },
    sourceMaps: true,
    module: { type: "commonjs" },
  });
  if (sourceMap) sourceMaps.set(id, sourceMap);

  const script = new vm.Script(code, { displayErrors: true, filename: id });
  const context = vm.createContext({ ...global, module, require, exports: {} });
  script.runInContext(context, { breakOnSigint: true, displayErrors: true });

  const exports = context.exports;
  module.exports = exports;
  module.loaded = true;
  return module;
}

import * as swc from "@swc/core";
import * as fs from "fs";
import * as path from "path";
import sourceMapSupport from "source-map-support";
import vm from "vm";

const globalRequire = require;

const sourceMaps = new Map<string, string>();

sourceMapSupport.install({
  handleUncaughtExceptions: false,
  environment: "node",
  retrieveSourceMap: (filename) => {
    const map = sourceMaps.get(filename);
    return map ? { url: filename, map } : null;
  },
});

// Half-assed implementatio of Node's require module loading that support hot reload.
export default function loadModule({
  cache,
  filename,
  parent,
}: {
  cache: NodeJS.Dict<NodeJS.Module>;
  filename: string;
  parent?: NodeJS.Module;
}): NodeJS.Module {
  const require: NodeJS.Require = (id: string) => {
    if (!id.startsWith(".")) return globalRequire(id);
    const child =
      cache[id] ??
      loadModule({
        cache,
        filename: require.resolve(id),
        parent: module,
      });
    if (!module.children.find(({ id }) => id === child.id))
      module.children.push(child);
    return child.exports;
  };

  require.cache = cache;
  require.main = undefined;
  require.extensions = {
    ...globalRequire.extensions,
    ".ts": compileTypeScript(sourceMaps),
  };

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

  const extension = require.extensions[path.extname(filename)];
  if (extension) extension(module, filename);
  module.loaded = true;
  return module;
}

function compileTypeScript(sourceMaps: Map<string, string>) {
  return (module: NodeJS.Module, filename: string) => {
    const { code, map: sourceMap } = swc.transformFileSync(filename, {
      envName: process.env.NODE_ENV,
      env: { targets: { node: 14 } },
      jsc: { parser: { syntax: "typescript" } },
      sourceMaps: true,
      module: { type: "commonjs", noInterop: true },
    });
    if (sourceMap) sourceMaps.set(filename, sourceMap);
    vm.compileFunction(
      code,
      ["exports", "require", "module", "__filename", "__dirname"],
      { filename }
    )(module.exports, module.require, module, filename, path.dirname(filename));
    module.loaded = true;
  };
}

import * as swc from "@swc/core";
import * as fs from "fs";
import { AbortController } from "node-abort-controller";
import path from "path";
import { addHook } from "pirates";
import sourceMapSupport from "source-map-support";
import getRuntime from "./util/getRuntime";

// Enable hot reloading, TypeScript support, and import/export in JavaScript.
export default async function moduleLoader({
  // The directory we're watching over
  dirname: dirname,
  // True to watch for changes and reload (dev server)
  watch,
}: {
  dirname: string;
  watch: boolean;
}) {
  const { jscTarget } = await getRuntime(dirname);
  const sourceMaps = new Map<string, string>();

  // When we detect a change, this is how we abort all watchers.  There is no
  // 'unwatch' method.  We also need this signal to ignore duplicate events.
  let abortWatchers = new AbortController();

  // To start watching over a file. A change triggers the abort signal.
  //
  // This function throws if the module resides outside the project root directory,
  // as it will not be included at runtime.
  //
  // You can still import from parent node_modules, since addHook ignores all of
  // node_modules.
  function watchOver(filename: string): true {
    if (!isInsideProjectDir(filename))
      throw new Error(
        `Do not import modules from outside the root directory ("${filename}")`
      );

    if (!watch) return true;

    // Bind event handler to this particular abort signal — change events may trigger
    // after the signal has been aborted, and we don't want fake reloads.
    const { signal } = abortWatchers;
    fs.watch(filename, { signal }, () => onFileChanged(filename, signal));
    return true;
  }

  function isInsideProjectDir(filename: string) {
    return !path.relative(dirname, filename).startsWith("../");
  }

  function onFileChanged(filename: string, signal: AbortSignal) {
    // When you save a file, this event may trigger multiple times :shrug:
    // We can rely on the abort signal to ignore multiple events
    if (signal.aborted) return;

    console.info(
      "♻️\tFile %s changed, reloading",
      path.relative(dirname, filename)
    );
    abortAllWatchers();
    clearRequireCache();
  }

  function abortAllWatchers() {
    abortWatchers.abort();
    abortWatchers = new AbortController();
  }

  function clearRequireCache() {
    for (const filename of Object.keys(require.cache)) {
      const relative = path.relative(dirname, filename);
      const evict = !relative.startsWith("node_modules/");
      if (evict) delete require.cache[filename];
    }
    sourceMaps.clear();
  }

  // We compile ECMAScript so you can use import/export in source files, and
  // also to support modern dialects transpiled to older Lambda runtime.
  function compileSourceFile({
    source,
    filename,
    syntax,
  }: {
    source: string;
    filename: string;
    syntax: "ecmascript" | "typescript";
  }) {
    const { code: compiled, map: sourceMap } = swc.transformSync(source, {
      filename,
      envName: process.env.NODE_ENV,
      jsc: { parser: { syntax }, target: jscTarget },
      module: { type: "commonjs", noInterop: true },
      sourceMaps: true,
      swcrc: false,
    });
    if (sourceMap) sourceMaps.set(filename, sourceMap);
    return compiled;
  }

  addHook(
    (source, filename) =>
      watchOver(filename) &&
      compileSourceFile({ source, filename, syntax: "ecmascript" }),
    { extensions: [".js", ".jsx"] }
  );
  addHook(
    (source, filename) =>
      watchOver(filename) &&
      compileSourceFile({ source, filename, syntax: "typescript" }),
    { extensions: [".ts", ".tsx"] }
  );
  addHook((source, filename) => watchOver(filename) && JSON.parse(source), {
    extensions: [".json"],
  });

  sourceMapSupport.install({
    environment: "node",
    retrieveSourceMap: (filename) => {
      const map = sourceMaps.get(filename);
      return map ? { url: filename, map } : null;
    },
  });
}

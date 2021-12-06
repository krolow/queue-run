import { JscTarget } from "@swc/core";
import chokidar from "chokidar";
import path from "path";
import loadModule from "./loadModule";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FunctionExports = { config: any; handler: any };

// Load a single function.  In development mode, this also hot-reloads the function.
export default function loadFunction({
  filename,
  jscTarget,
  watch,
}: {
  filename: string;
  jscTarget: JscTarget;
  watch: boolean;
}): FunctionExports {
  const paths = new Set<string>();
  const exports = loadAndVerify({ filename, jscTarget, paths });

  if (watch) {
    const watcher = chokidar.watch(Array.from(paths), { ignoreInitial: true });
    watcher.on("change", (changed) => {
      console.debug(
        "File %s changed => reloading %s",
        path.relative(process.cwd(), changed),
        path.relative(process.cwd(), filename)
      );

      try {
        Object.assign(exports, loadAndVerify({ filename, jscTarget, paths }));
      } catch (error) {
        console.error("Error loading %s", filename, (error as Error).stack);
      }
      watcher.add(Array.from(paths));
    });
  }

  return exports;
}

function loadAndVerify({
  filename,
  paths,
  jscTarget,
}: {
  filename: string;
  paths: Set<string>;
  jscTarget: JscTarget;
}): FunctionExports {
  if (!isValidFunctionName(filename))
    throw new Error(
      `Filename can only contain alphanumeric, hyphen, or underscore ('${filename}')`
    );

  const cache = {};
  try {
    const { exports } = loadModule({ filename, cache, jscTarget });

    const handler = exports.handler || exports.default;
    if (typeof handler !== "function") {
      throw new Error(`Expected ${filename} to export a function (default)`);
    }

    const config = exports.config || {};
    if (typeof config !== "object") {
      throw new Error(`Expected ${filename} to export an object (config)`);
    }

    return { config, handler };
  } finally {
    paths.clear();
    Object.keys(cache).forEach((path) => paths.add(path));
  }
}

function isValidFunctionName(filename: string) {
  const basename = path.basename(filename, path.extname(filename));
  return /^[a-zA-Z0-9_-]+(\.fifo)?$/.test(basename);
}

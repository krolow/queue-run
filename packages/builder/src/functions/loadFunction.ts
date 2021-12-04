import chokidar from "chokidar";
import path from "path";
import loadModule from "./loadModule";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FunctionExports = { config: any; handler: any };

// Load a single function.  In development mode, this also hot-reloads the function.
export default function loadFunction({
  envVars,
  filename,
  watch,
}: {
  envVars: Record<string, string>;
  filename: string;
  watch: boolean;
}): FunctionExports {
  const paths = new Set<string>();
  const exports = loadAndVerify({ envVars, filename, paths });

  if (watch) {
    const watcher = chokidar.watch(Array.from(paths), { ignoreInitial: true });
    watcher.on("change", (changed) => {
      console.debug(
        "File %s changed => reloading %s",
        path.relative(process.cwd(), changed),
        path.relative(process.cwd(), filename)
      );

      try {
        Object.assign(exports, loadAndVerify({ envVars, filename, paths }));
      } catch (error) {
        console.error("Error loading %s", filename, (error as Error).stack);
      }
      watcher.add(Array.from(paths));
    });
  }

  return exports;
}

function loadAndVerify({
  envVars,
  filename,
  paths,
}: {
  envVars: Record<string, string>;
  filename: string;
  paths: Set<string>;
}): FunctionExports {
  const cache = {};
  try {
    const { exports } = loadModule({ envVars, filename, cache });

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

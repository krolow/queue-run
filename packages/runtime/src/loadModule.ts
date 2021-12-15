import path from "path";
import { install } from "source-map-support";
import { loadModuleSymbol } from "./index";

type Export = { [name: string]: any };
type Module = Export | Error | null;

declare var global: {
  [loadModuleSymbol]: (filename: string) => Promise<any>;
};

// We load backend functions on-demand when we need them for a route, queue, etc.
// We also use this mechanism to load middleware and other modules.
//
// The module is imported dynamically in the current context, and cached.
//
// If the module exists, this function returns the exports.
//
// If the module doesn't exist, this function returns null.
//
// If it fails while importing the module, it throws an error.
export default async function loadModule<T = Export>(
  // The module name as route (not filename), eg "/api/project/$id",
  // "/queue/update_score", "/api/project/_middleware""
  name: string
): Promise<T | null> {
  // Avoid path traversal. This turns "foobar", "/foobar", and "../../foobar" into "/foobar".
  const partialPath = path.join("/", name);
  const filename = path.format({
    dir: "backend",
    name: partialPath.slice(1),
    ext: ".js",
  });
  try {
    return await global[loadModuleSymbol](filename);
  } catch (error) {
    if (
      error instanceof Error &&
      (error as Error & { code: string }).code === "ERR_MODULE_NOT_FOUND"
    ) {
      return null;
    } else {
      console.error("Error loading %s", filename, error);
      throw error;
    }
  }
}

// Adds source maps for stack traces
install({ environment: "node" });

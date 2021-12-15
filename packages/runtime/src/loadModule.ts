import { R_OK } from "constants";
import { access } from "fs/promises";
import path from "path";
import { install } from "source-map-support";

type Export = { [name: string]: any };
type Module = Export | Error | null;

const cache = new Map<string, Module>();

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
  if (cache.has(name)) {
    const cached = cache.get(name);
    if (cached instanceof Error) throw cached;
    return (cached as T) ?? null;
  }

  // Avoid path traversal. This turns "foobar", "/foobar", and "../../foobar" into "/foobar".
  const partialPath = path.join("/", name);
  const filename = path.format({
    dir: "backend",
    name: partialPath.slice(1),
    ext: ".js",
  });

  try {
    await access(filename, R_OK);
  } catch {
    cache.set(name, null);
    return null;
  }

  try {
    const exported = await import(filename);
    cache.set(name, exported);
    return exported;
  } catch (error) {
    if (
      error instanceof Error &&
      (error as Error & { code: string }).code === "ERR_MODULE_NOT_FOUND"
    ) {
      cache.set(name, null);
      return null;
    } else {
      console.error("Error loading %s", filename, error);
      cache.set(
        name,
        error instanceof Error ? Error : new Error(String(error))
      );
      throw error;
    }
  }
}

// Adds source maps for stack traces
install({ environment: "node" });

import path from "path";
import { install } from "source-map-support";
import type { Middleware } from "../types";

// We load backend functions on-demand when we need them for a route, queue, etc.
// We also use this mechanism to load middleware and other modules.
//
// If the module doesn't exist, this function returns null.
export default async function loadModule<Exports = {}>(
  // The module name as route (not filename), eg "/api/project/$id",
  // "/queue/update_score", "/api/_middleware""
  name: string
): Promise<(Exports & Middleware) | null> {
  // Avoid path traversal. This turns "foobar", "/foobar", and "../../foobar" into "/foobar".
  const fromProjectRoot = path.join("/", name);
  const filename = path.join(path.resolve("backend"), fromProjectRoot);
  const middleware = await loadMiddleware(fromProjectRoot);
  try {
    const exports = await require(filename);
    return { ...middleware, ...exports };
  } catch (error) {
    const code =
      error instanceof Error && (error as Error & { code: string }).code;
    if (code === "MODULE_NOT_FOUND") {
      return null;
    } else {
      console.error("Error loading %s", filename, error);
      throw error;
    }
  }
}

// Given a path, returns the combined middleware for that folder and all parent
// folders.
async function loadMiddleware(name: string): Promise<Middleware> {
  if (name === "/") return {};
  const parent = await loadMiddleware(path.dirname(name));
  const filename = path.join(path.resolve("backend"), name, "_middleware");
  try {
    const exports = await require(filename);
    return { ...parent, ...exports };
  } catch (error) {
    const code =
      error instanceof Error && (error as Error & { code: string }).code;
    if (code === "MODULE_NOT_FOUND") return parent;
    throw error;
  }
}

// Adds source maps for stack traces
install({ environment: "node" });

import path from "path";
import { install } from "source-map-support";
import type { Middleware } from "../types";

// Use this for loading backend functions on demand:
//
// - Load module on-demand
// - Return null if module is not found
// - Load middleware and merge into module
// - Compatible with dev server HMR
export default async function loadModule<Exports = {}>(
  // The module name as route (not filename), eg "/api/project/$id",
  // "/queue/update_score"
  name: string
): Promise<Readonly<Exports & Middleware> | null> {
  const fromProjectRoot = path.join("/", name);
  const filename = path.join(path.resolve("backend"), fromProjectRoot);
  try {
    // Avoid path traversal. This turns "foobar", "/foobar", and "../../foobar" into "/foobar"
    const middleware = await loadMiddleware(fromProjectRoot);
    const exports = await require(filename);
    // This module's exports take precendece over _middleware
    return { ...middleware, ...exports };
  } catch (error) {
    const code =
      error instanceof Error && (error as Error & { code: string }).code;
    if (code === "MODULE_NOT_FOUND") {
      return null;
    } else {
      console.error("Error loading module %s", filename, error);
      throw error;
    }
  }
}

// Given a path, returns the combined middleware for that folder and all parent
// folders. For example, given the module name '/api/project/:id', this will return the
// combined middleware for 'backend/api/project', 'backend/api', and '/backend'.
async function loadMiddleware(name: string): Promise<Middleware | undefined> {
  if (name === "/") return undefined;
  const parent = await loadMiddleware(path.dirname(name));
  const filename = path.join(path.resolve("backend"), name, "_middleware");
  try {
    const exports = await require(filename);
    // This middleware's exports take precendece over parent's
    return { ...parent, ...exports };
  } catch (error) {
    const code =
      error instanceof Error && (error as Error & { code: string }).code;
    // Module doesnt exist, don't sweat it
    if (code === "MODULE_NOT_FOUND") return parent;

    console.error("Error loading middleware %s", filename, error);
    throw error;
  }
}

// Adds source maps for stack traces
install({ environment: "node" });

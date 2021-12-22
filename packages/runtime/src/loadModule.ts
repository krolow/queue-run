import path from "path";
import type { Middleware } from "queue-run";
import { install } from "source-map-support";

// Use this for loading backend functions on demand:
//
// - Load module on-demand
// - Return null if module is not found
// - Load middleware and merge into module
// - Compatible with dev server HMR
export default async function loadModule<
  Handler = () => Promise<void>,
  Config = {}
>(
  // The module name as route (not filename), eg "/api/project/$id",
  // "/queues/update_profile.fifo"
  name: string
): Promise<Readonly<
  {
    handler: Handler;
    config: Config;
  } & Middleware
> | null> {
  // Avoid path traversal. This turns "foobar", "/foobar", and "../../foobar" into "/foobar"
  const fromProjectRoot = path.join("/", name);
  let filename;
  try {
    filename = require.resolve(path.join(process.cwd(), fromProjectRoot));
  } catch (error) {
    return null;
  }
  const exports = await require(filename);

  const handler = exports.handler ?? exports.default;
  if (typeof handler !== "function")
    throw new Error(
      `Module error: expected module to export a handler (in ${filename})`
    );
  const config = exports.config ?? {};
  verifyMiddleware(exports, filename);

  const middleware = await loadMiddleware(fromProjectRoot);
  // This module's exports take precendece over _middleware
  return { ...middleware, ...exports, handler, config };
}

// Given a path, returns the combined middleware for that folder and all parent
// folders. For example, given the module name '/api/project/:id', this will return the
// combined middleware for 'api/project', 'api', and '/'.
async function loadMiddleware(name: string): Promise<Middleware | undefined> {
  const parent =
    name === "/" ? undefined : await loadMiddleware(path.dirname(name));
  let filename;
  try {
    filename = require.resolve(path.join(process.cwd(), name, "_middleware"));
  } catch {
    return parent;
  }
  const exports = await require(filename);
  verifyMiddleware(exports, filename);
  // This middleware's exports take precendece over parent's
  return { ...parent, ...exports };
}

function verifyMiddleware(middleware: Middleware, filename: string): void {
  const fnNames: (keyof Middleware)[] = [
    "authenticate",
    "onError",
    "onRequest",
    "onResponse",
  ];
  for (const fnName of fnNames) {
    const fn = middleware[fnName];
    if (fn && typeof fn !== "function")
      throw new Error(
        `Middleware error: ${fnName} must be a function (in ${filename})`
      );
  }
}

// Adds source maps for stack traces
install({ environment: "node" });

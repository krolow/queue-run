import fs from "node:fs/promises";
import path from "node:path";

/**
 * Loads backend functions on demand.
 *
 * This will merge middleware in the following order:
 * - The module itself
 * - _middleware.ts file in the current directory
 * - _middleware.ts file in the parent directory (recursively)
 * - Default middelware (second argument)
 *
 * @param filename The function's filename
 * @param defaultMiddleware Default middleware, if applicable
 * @returns The module (exported values) and middleware
 */
export default async function loadModule<ModuleExports, Middleware>(
  filename: string,
  defaultMiddleware?: Middleware
): Promise<Readonly<{
  module: ModuleExports;
  middleware: Middleware;
}> | null> {
  // Avoid path traversal. This will turn "foobar", "/foobar", and
  // "../../foobar" into "/foobar".  Also prevents us from loading node modules.
  const fromProjectRoot = path.join("/", filename);
  const absolute = path.join(process.cwd(), fromProjectRoot);
  try {
    await fs.access(absolute);
  } catch {
    return null;
  }
  const module = (await import(absolute)) as ModuleExports;
  const middleware = await loadMiddleware<Middleware>(fromProjectRoot);
  return {
    // Route takes precendece over _middleware
    middleware: combine(
      module as unknown as Middleware,
      ...middleware,
      defaultMiddleware ?? ({} as Middleware)
    ),
    module,
  };
}

/**
 * Given a path, returns the combined middleware for that folder and all parent
 * folders. For example, given the module name '/api/project/[id]/index.ts',
 * this will return the combined middleware from
 * 'api/project'/[id]/_middleware.js', 'api/project/_middleware.js', and
 * 'api/_middleware.js'.
 */
async function loadMiddleware<Middleware>(
  dirname: string
): Promise<Middleware[]> {
  if (dirname === "/") return [];
  const parent = await loadMiddleware<Middleware>(path.dirname(dirname));
  const absolute = path.join(process.cwd(), dirname, "_middleware.js");
  try {
    await fs.access(absolute);
  } catch {
    return parent;
  }
  const exports = await import(absolute);
  // This middleware's exports take precendece over parent's
  return [exports, ...parent];
}

function combine<T = { [key: string]: Function }>(...middleware: T[]): T {
  return middleware.reduce((combined, previous) =>
    Object.entries(previous).reduce(
      (combined, [key, value]: [string, Function]) =>
        ({
          ...combined,
          // @ts-ignore
          [key]: key in combined ? combined[key] : value,
        } as T),
      combined
    )
  );
}

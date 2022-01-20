import glob from "fast-glob";
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
 * @returns The module (exported values) and middleware, or null if the module does not exist
 */
export async function loadModule<ModuleExports, Middleware>(
  filename: string,
  defaultMiddleware: Middleware = {} as Middleware
): Promise<Readonly<{
  module: ModuleExports;
  middleware: Middleware;
}> | null> {
  // Avoid path traversal. This will turn "foobar", "/foobar", and
  // "../../foobar" into "foobar".  Also prevents us from loading node modules.
  const fromProjectRoot = path.join("/", filename).slice(1);
  const [absolute] = await glob(`${filename}{.mjs,.js,}`, {
    absolute: true,
  });
  if (!absolute) return null;
  const module = (await import(absolute)) as ModuleExports;
  const { middleware } = await loadMiddleware<Middleware>(
    path.dirname(fromProjectRoot),
    defaultMiddleware
  );
  return {
    // Route takes precendece over _middleware
    middleware: combine(module as unknown as Middleware, middleware),
    module,
  };
}

/**
 * Load middleware on demand.
 *
 * This will combine middleware from the current and all parent directories,
 * excluding the root directory.
 *
 * For example, for the module 'api/project/[id]/index.ts', call this function
 * with `api/project/[id]` and it will combinethe middleware:
 * - api/project/[id]/_middleware.ts
 * - api/project/_middleware.ts
 * - api/_middleware.ts
 * - Default middleware (second argument)
 *
 * @param dirname The directory
 * @param defaultMiddleware The default middleware
 * @returns The combined middleware
 */
export async function loadMiddleware<Middleware>(
  dirname: string,
  defaultMiddleware: Middleware
): Promise<{
  middleware: Middleware;
}> {
  if (dirname === ".") return { middleware: defaultMiddleware };

  const { middleware: parent } = await loadMiddleware<Middleware>(
    path.dirname(dirname),
    defaultMiddleware
  );
  const [absolute] = await glob("_middleware.{mjs,js}", {
    cwd: path.join(process.cwd(), dirname),
    absolute: true,
  });
  if (!absolute) return { middleware: parent };

  const exports = await import(absolute);
  // This middleware's exports take precendece over parent's
  return { middleware: combine(exports, parent) };
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

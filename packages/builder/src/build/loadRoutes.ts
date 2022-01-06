import glob from "fast-glob";
import path from "path";
import { Key, match, pathToRegexp } from "path-to-regexp";
import {
  HTTPRoute,
  loadModule,
  RouteExports,
  RouteMiddleware,
} from "queue-run";

const maxTimeout = 60;
const defaultTimeout = 30;

// Loads all routes from the current directory
export default async function loadRoutes(): Promise<Map<string, HTTPRoute>> {
  const routes = new Map<
    // URL path eg /project/:projectId
    string,
    HTTPRoute
  >();
  const dupes = new Map<
    // URL path without parameter names eg /project/:
    string,
    // Filename
    string
  >();

  const filenames = await glob("api/**/[!_]*.{js,jsx,ts,tsx}");
  for (const filename of filenames) {
    try {
      const loaded = await loadModule<RouteExports, RouteMiddleware>(filename);
      if (!loaded) throw new Error(`Could not load module ${filename}`);
      const { module, middleware } = loaded;

      const path = pathFromFilename(filename.replace(/^api\//, "/"));

      const signature = path.replace(/:(.*?)(\/|$)/g, ":$2");
      const identical = dupes.get(signature);
      if (identical)
        throw new Error(
          `Found two identical routes: "${identical}" and "${filename}"`
        );
      dupes.set(signature, filename);

      validateMiddleware({ ...middleware, ...module });

      const config = module.config ?? {};
      routes.set(path, {
        accepts: getContentTypes(config),
        cors: config.cors ?? true,
        methods: getMethods(module),
        filename,
        match: match(path),
        timeout: getTimeout(config),
      });
    } catch (error) {
      throw new Error(`Error in "${filename}": ${error}`);
    }
  }
  return routes;
}

// foo/[bar]/index.js -> foo/:bar
//
// This also does a lot of validation and throws errors for common mistakes like
// space in filename, duplicate parameter names, etc.
function pathFromFilename(filename: string): string {
  // Separate basename, so we can drop extension and /index.js
  const basename = path.basename(filename, path.extname(filename)).normalize();
  const directory = path.dirname(filename).normalize();
  const withoutIndex =
    basename === "index" ? directory : `${directory}/${basename}`;

  const renamed = renamePathProperties(withoutIndex);
  validatePathParameters(renamed);
  return renamed;
}

function validatePathParameters(path: string) {
  const keys: Key[] | undefined = [];
  pathToRegexp(path, keys);

  if (new Set(keys.map((key) => key.name)).size < keys.length)
    throw new Error("Found two parameters with the same name");

  const catchAll = keys.findIndex(({ modifier }) => modifier === "*");
  if (catchAll >= 0 && catchAll !== keys.length - 1)
    throw new Error(
      "The catch-all parameter can only come at the end of the path"
    );

  if (!path.split("/").filter(Boolean).every(isValidPathPart))
    throw new Error(
      "Path parts may only be alphanumeric, dash, underscore, or dot"
    );
}

// foo/[bar].js -> foo/:bar
// foo/[...bar].js -> foo/:bar*
//
// path-to-regexp uses colon for named parameters.  Can't use these in file
// names, Windows always used colon for something else.  Besides, it's easier to
// see parameters in file names when using brackets than with a single prefix
// (colon, dollar, etc).
function renamePathProperties(filename: string): string {
  return filename
    .split("/")
    .map((part) =>
      part.replace(/^\[\.{3}(.*)\]$/, ":$1*").replace(/^\[(.*)\]$/, ":$1")
    )
    .join("/");
}

// path-to-regexp supports a lot more options than we want to allow in filenames.
// If you need all these options, use rewrite rules.
//  We limit to "file_name_92-3.js".
function isValidPathPart(part: string): boolean {
  return /^([a-z0-9_-]+)|(:[a-z0-9_-]+\*?)$/i.test(part);
}

function getMethods(module: RouteExports): Set<string> {
  const { config } = module;

  const methodHandlers = (
    [
      "get",
      "post",
      "put",
      "del",
      "delete",
      "patch",
      "options",
      "head",
    ] as Array<keyof RouteExports>
  ).filter((method) => typeof module[method] === "function");
  if (methodHandlers.length > 0) {
    if (config?.methods)
      throw new Error(
        "config.methods: cannot use this together with explicit method handlers"
      );
    return new Set(
      methodHandlers
        .map((method) => method.toUpperCase())
        .map((method) => (method === "DEL" ? "DELETE" : method))
    );
  } else {
    const handler = module.default;
    if (!handler)
      throw new Error(
        "Module missing request handler (export default function …)"
      );

    const methods = (
      Array.isArray(config?.methods)
        ? config!.methods
        : [config?.methods ?? "*"]
    ).map((method) => method.toUpperCase());
    if (!methods.every((method) => /^[A-Z]+|\*$/.test(method)))
      throw new Error(
        `config.methods list acceptable HTTP methods, like "GET" or ["GET", "POST"]`
      );
    return new Set(methods);
  }
}

function getContentTypes(config: { accepts?: string[] | string }): Set<string> {
  const accepts = new Set(
    Array.isArray(config?.accepts) ? config.accepts : [config?.accepts ?? "*/*"]
  );
  if (
    !Array.from(accepts).every((accepts) =>
      /^([a-z]+|\*)\/([a-z]+|\*)$/i.test(accepts)
    )
  )
    throw new Error(
      `config.accepts lists acceptable MIME types, like "application/json" or "text/*"`
    );
  return accepts;
}

function getTimeout({ timeout }: { timeout?: number }): number {
  if (timeout === undefined || timeout === null) return defaultTimeout;
  if (typeof timeout !== "number")
    throw new Error("config.timeout must be a number (seconds)");
  if (timeout < 1) throw new Error("config.timeout must be at least 1 second");
  if (timeout > maxTimeout)
    throw new Error(`config.timeout cannot be more than ${maxTimeout} seconds`);
  return timeout;
}

function validateMiddleware(middleware: RouteMiddleware): void {
  (
    ["authenticate", "onError", "onRequest", "onResponse"] as Array<
      keyof RouteMiddleware
    >
  ).forEach((key) => {
    if (middleware[key] && typeof middleware[key] !== "function")
      throw new Error(`Exported ${key} must be a function`);
  });
}

import glob from "fast-glob";
import fs from "node:fs/promises";
import path from "node:path";
import { Key, pathToRegexp } from "path-to-regexp";
import type { Manifest, RouteExports, RouteMiddleware } from "queue-run";
import { loadModule } from "queue-run";

const maxTimeout = 120;
const defaultTimeout = 10;

// Loads all routes from the current directory
export default async function mapRoutes(): Promise<Manifest["routes"]> {
  const dupes = new Map<
    // URL path without parameter names eg /project/:
    string,
    // Filename
    string
  >();

  const filenames = await glob("api/**/[!_]*.{mjs,js,jsx,ts,tsx}");
  return Promise.all(
    filenames.map(async (filename) => {
      const loaded = await loadModule<RouteExports, RouteMiddleware>(filename);
      if (!loaded) throw new Error(`Could not load module ${filename}`);
      const { module, middleware } = loaded;

      const path = pathFromFilename(filename.replace("api/", "/"));

      const signature = path.replace(/:(.*?)(\/|$)/g, ":$2");
      const identical = dupes.get(signature);
      if (identical)
        throw new Error(
          `Found two identical routes: "${identical}" and "${filename}"`
        );
      dupes.set(signature, filename);

      validateMiddleware({ ...middleware, ...module });

      const config = module.config ?? {};
      return {
        path,
        accepts: getContentTypes(config),
        cors: config.cors ?? true,
        methods: getMethods(module),
        filename,
        original: await getOriginalFilename(filename),
        timeout: getTimeout(config),
      };
    })
  );
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
    basename === "index"
      ? directory
      : path.join(directory, basename).normalize();

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
}

// foo/[bar].js -> foo/:bar
// foo/[...bar].js -> foo/:bar*
//
// path-to-regexp uses colon for named parameters.  Can't use these in file
// names, Windows always used colon for something else.  Besides, it's easier to
// see parameters in file names when using brackets than with a single prefix
// (colon, dollar, etc).
function renamePathProperties(filename: string): string {
  return filename.replace(/\[(\.{3})?(.*?)\]/gi, (_, variadic, name) => {
    if (!/^[a-z0-9_-]+$/i.test(name))
      throw new Error(
        "Path parameters must be alphanumeric, dash, or underscore"
      );
    return variadic ? `:${name}*` : `:${name}`;
  });
}

function getMethods(module: RouteExports): string[] {
  const { config } = module;

  const methods = (
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
  )
    .filter((method) => typeof module[method] === "function")
    .map((method) => method.toUpperCase())
    .map((method) => (method === "DEL" ? "DELETE" : method));

  if (methods.length > 0) {
    if (config?.methods)
      throw new Error(
        "config.methods: cannot use this together with explicit method handlers"
      );
    const specified = new Set(methods);
    if (specified.has("GET")) specified.add("HEAD");
    return Array.from(specified);
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
    return methods;
  }
}

function getContentTypes(config: { accepts?: string[] | string }): string[] {
  const accepts = Array.isArray(config?.accepts)
    ? config.accepts
    : [config?.accepts ?? "*/*"];
  if (!accepts.every((type) => /^([a-z-]+|\*)\/([a-z-]+|\*)$/i.test(type)))
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
    ["authenticate", "onRequest", "onResponse"] as Array<keyof RouteMiddleware>
  ).forEach((key) => {
    if (middleware[key] && typeof middleware[key] !== "function")
      throw new Error(`Exported ${key} must be a function`);
  });
}

async function getOriginalFilename(filename: string) {
  const { sources } = JSON.parse(await fs.readFile(`${filename}.map`, "utf-8"));
  return sources[0];
}

import path from "node:path";
import { URL } from "node:url";
import { compile, Key, pathToRegexp } from "path-to-regexp";
import selfPath from "../shared/selfPath.js";

type Params = {
  [key: string]: string | number | boolean | (string | number | boolean)[];
};

/* eslint-disable no-unused-vars */
interface URLFunction {
  /**
   * Returns URL for the given path by expanding path parameters and adding
   * query string parameters.
   *
   * @param path String or URL object
   * @param params Path parameters (optional)
   * @param params Path parameters (optional)
   * @returns Absolute URL
   *
   * ```
   * url('/bookmarks/:id', { id: '123' })
   * => https://example.com/bookmarks/123
   *
   * url('/bookmarks', null, { sort: 'date' })
   * => https://example.com/bookmarks?sort=date
   * ```
   *
   * @note Relative paths are expanded to absolute paths. `file:` paths
   * accepted, so long as the file is a request handler.
   */
  (path: string | URL, params?: Params, query?: Params): string;

  /**
   * Returns URL constructor function for the given path.
   *
   * `url.for(path)(params, query)` is equivalent to `url(path, params, query)`.
   *
   * @param path String or URL object
   * @returns URL constructor function
   */
  for<P extends Params, Q extends Params>(
    path: string | URL
  ): URLConstructor<P, Q>;

  /**
   * Returns URL constructor function for this module.
   *
   * Shortcut for `url.for(import.meta.url)`.
   *
   * @returns URL constructor function
   * @throws Called not from within a request handler
   */
  self<P extends Params, Q extends Params>(): URLConstructor<P, Q>;

  /**
   * The base URL. If set, then URL functions will return absolute URLs using
   * this base URL.
   */
  baseURL: string | undefined;

  /**
   * The root directory. Used to determine the path when using url.self().
   *
   * For example, if the root directory is "api/", then calling url.self()
   * from withing "api/bookmarks/123" will return "bookmarks/123".
   */
  rootDir: string;
}

interface URLConstructor<P extends Params, Q extends Params> {
  /**
   * Returns URL by expanding path parameters and adding
   *
   * @param params Path parameters (optional)
   * @param params Path parameters (optional)
   * @returns Absolute URL
   *
   * ```
   * myURL({ id: '123' })
   * => https://example.com/bookmarks/123
   * ```
   */
  (params?: P, query?: Q): string;
}
/* eslint-enable no-unused-vars */

const url: URLFunction = (
  pathOrURL: string | URL,
  params?: Params,
  query?: Params
): string => {
  return newURLContructor<Params, Params>(pathOrURL)(params, query);
};

url.for = <P extends Params, Q extends Params>(path: string | URL) => {
  return newURLContructor<P, Q>(path);
};

url.self = <P extends Params, Q extends Params>() => {
  const pathname = selfPath();
  const root = path.normalize((url.rootDir ?? ".") + "/");
  if (!pathname.startsWith(root))
    throw new Error(`You can only use self from the root directory ${root}`);
  return newURLContructor<P, Q>(pathname.slice(root.length));
};

url.rootDir = "/";
url.baseURL = undefined;

export default url;

function newURLContructor<P extends Params = Params, Q extends Params = Params>(
  path: string | URL
): URLConstructor<P, Q> {
  const normalized = replaceBracket(getPath(path, url.baseURL));
  const compiled = compile(normalized);
  const keys: Key[] = [];
  pathToRegexp(normalized, keys);
  const pathParams = new Set(keys.map((key) => key.name));

  const constructor = function (params?: P, query?: Q) {
    const expanded = compiled(params);
    const parsed = new URL(expanded, url.baseURL ?? "relative://");
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (!pathParams.has(key)) {
          if (Array.isArray(value))
            value.forEach((value) =>
              parsed.searchParams.append(key, String(value))
            );
          else if (value !== undefined)
            parsed.searchParams.append(key, String(value));
        }
      });
    }
    if (query) {
      Object.entries(query).forEach(([key, value]) => {
        if (Array.isArray(value))
          value.forEach((value) =>
            parsed.searchParams.append(key, String(value))
          );
        else if (value !== undefined)
          parsed.searchParams.append(key, String(value));
      });
    }
    return parsed.href.replace(/^relative:\/\//, "");
  };

  constructor.toString = () => path;
  constructor.valueOf = () => path;

  return constructor;
}

function getPath(pathOrURL: string | URL, baseURL?: string): string {
  const { pathname, protocol } = new URL(
    String(pathOrURL),
    baseURL ?? "relative://"
  );
  return protocol === "file:"
    ? path.relative(process.cwd(), pathname).replace(/\.[mc]?js$/, "")
    : pathname;
}

function replaceBracket(path: string): string {
  return path.replace(
    /\[(.+?)\]/g,
    (_, name) => ":" + (name.startsWith("...") ? name.slice(3) + "*" : name)
  );
}

import { compile } from "path-to-regexp";
import { URL } from "url";
import { getLocalStorage } from "./localStorage";
import selfPath from "./selfPath";

type Params = {
  [key: string]: string | number | boolean | (string | number | boolean)[];
};

/* eslint-disable no-unused-vars */
interface URLFunction<P extends Params, Q extends Params> {
  (path: string, params?: P, query?: Q): string;

  for<P extends Params, Q extends Params>(path: string): URLConstructor<P, Q>;

  self<P extends Params, Q extends Params>(): URLConstructor<P, Q>;
}

interface URLConstructor<P extends Params, Q extends Params> {
  (params?: P, query?: Q): string;

  toString(): string;
}

/* eslint-enable no-unused-vars */

// Use URL template and parameters to create a URL.
//
// For example:
//   url('/task/:id', { id: 123 }) -> https://project.queue.run/task/123
//
// You can also include query parameters:
//
//   url('/tasks', null, { category: 'xyz' }) -> https://project.queue.run/tasks?category=xyz
//
// With a relative URL, this will return an absolute URL using the server's
// hostname.
//
// You can use [name] or :name to subsitute a parameter that has a single value.
// Use [...name] or :name* to subsitute a parameter that has multiple values. For example:
//
//   url('/[...names]', { names: ['foo', 'bar']}) -> https://project.queue.run/foo/bar
//
// If a query parameter is an array, it will add multiple values to the URL, for example:
//
//  url('/', null, { category: ['abc', 'def'] }) -> https://project.queue.run/?category=abc&category=def
//
// You can provide a URL construction function to other modules that don't need to know the URL path:
//
//   const urlForItem = url.for('/items/[id]');
//   const item1 = urlForItem({ id: 123 });
//
// As a convenience, you can also do this from any route:
//
//   // In api/item/[id].ts
//   export const urlForItem = url.self();
//
//   // In api/items.ts
//   import { urlForItem } from "./[id]";
const url: URLFunction<{}, {}> = (
  path: string,
  params?: { [key: string]: unknown | unknown[] },
  query?: { [key: string]: unknown | unknown[] }
): string => {
  const urls = getLocalStorage().getStore()?.urls;
  if (!urls) throw new Error("No runtime available");

  const pathname = compile(replaceBracket(path))(params);
  const url = new URL(pathname, urls.http);
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (Array.isArray(value))
        value.forEach((value) => url.searchParams.append(key, value));
      else if (value !== undefined) url.searchParams.append(key, String(value));
    });
  }

  return url.href;
};

url.for = (path: string) => {
  const constructor: URLConstructor<Params, Params> = (params, query) =>
    url(path, params, query);

  constructor.toString = () => url(path);
  constructor.valueOf = () => url(path);
  return constructor as URLConstructor<{}, {}>;
};
url.self = <P extends Params, Q extends Params>() => {
  const pathname = selfPath();
  if (!pathname.startsWith("api/"))
    throw new Error("You can only use self from an api route");
  return url.for<P, Q>(pathname.slice(4));
};

export default url;

function replaceBracket(path: string): string {
  return path.replace(
    /(^|\/)\[(.+?)\](\/|\?|#|$)/g,
    (_, before, name, after) =>
      `${before}:${name.startsWith("...") ? name.slice(3) + "*" : name}${after}`
  );
}

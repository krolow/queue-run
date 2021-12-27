import { compile } from "path-to-regexp";
import { URL } from "url";
import { getLocalStorage } from "./localStorage";

// Use URL template and parameters to create a URL.
//
// For example:
//   url('/task/:id', { id: '123' }) -> https://project.queue.run/task/123
//
// You can also include query parameters:
//
//   url('/tasks', null, { category: '123' }) -> https://project.queue.run/tasks?category=123
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
//  url('/', null, { category: ['123', '456'] }) -> https://project.queue.run/?category=123&category=456
export default function url(
  path: string,
  params?: { [key: string]: string | string[] },
  query?: { [key: string]: string | string[] }
): string {
  const urls = getLocalStorage().getStore()?.urls;
  if (!urls) throw new Error("No runtime available");

  const pathname = compile(replaceBracket(path))(params);
  const url = new URL(pathname, urls.http);
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (Array.isArray(value))
        value.forEach((value) => url.searchParams.append(key, value));
      else if (value !== undefined) url.searchParams.append(key, value ?? "");
    });
  }

  return url.href;
}

function replaceBracket(path: string): string {
  return path.replace(
    /(^|\/)\[(.+?)\](\/|\?|#|$)/g,
    (_, before, name, after) =>
      `${before}:${name.startsWith("...") ? name.slice(3) + "*" : name}${after}`
  );
}

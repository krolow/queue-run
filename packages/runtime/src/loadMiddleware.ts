import { Request, Response } from "node-fetch";
import path from "path";
import { URL } from "url";
import type { AuthenticateMethod } from "../../sdk/types/runtime";
import loadModule from "./loadModule";

// Middleware exposed from a backend function or shared _middleware file.
export declare type Middleware = {
  authenticate?: AuthenticateMethod;
};

// Given a path, returns the combined middleware for that module and all folders.
export default async function loadMiddleware(
  request: Request
): Promise<Middleware> {
  const { pathname } = new URL(request.url);
  const shared = await combineSharedMiddleware(path.dirname(pathname));
  const module = await loadFromModule(pathname);
  return { ...shared, ...module };
}

async function loadFromModule(path: string): Promise<Middleware | undefined> {
  const module = await loadModule(path);
  if (!module) return undefined;
  const { authenticate } = module;
  if (authenticate && typeof authenticate !== "function") {
    console.error("Exported 'authenticate' is not a function in %s", path);
    throw new Response("Unauthorized", { status: 403 });
  }
  return { authenticate };
}

async function combineSharedMiddleware(
  sharedPath: string
): Promise<Middleware> {
  const parent =
    sharedPath === "/"
      ? undefined
      : await combineSharedMiddleware(path.dirname(sharedPath));
  const module = await loadFromModule(path.join(sharedPath, "_middleware"));
  return {
    ...parent,
    ...module,
  };
}

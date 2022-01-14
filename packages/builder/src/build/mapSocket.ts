import glob from "fast-glob";
import fs from "node:fs/promises";
import path from "node:path";
import {
  loadModule,
  Manifest,
  RouteMiddleware,
  WebSocketExports,
  WebSocketMiddleware,
} from "queue-run";

const maxTimeout = 30;
const defaultTimeout = 10;

export default async function mapSocket(): Promise<Manifest["socket"]> {
  const filenames = await glob("socket/[!_]*.{js,jsx,ts,tsx}");
  return Promise.all(
    filenames.map(async (filename) => {
      const loaded = await loadModule<WebSocketExports, WebSocketMiddleware>(
        filename
      );
      if (!loaded) throw new Error(`Could not load module ${filename}`);
      const { module, middleware } = loaded;

      const path = pathFromFilename(filename);
      validateMiddleware({ ...middleware, ...module });

      const config = module.config ?? {};
      return {
        path,
        filename,
        original: await getOriginalFilename(filename),
        timeout: getTimeout(config),
      };
    })
  );
}

function pathFromFilename(filename: string): string {
  const basename = path.basename(filename, path.extname(filename)).normalize();
  return basename === "index" ? "/" : `/${basename}`;
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
    ["authenticate", "onError", "onMessageReceived", "onMessageSent"] as Array<
      keyof RouteMiddleware
    >
  ).forEach((key) => {
    if (middleware[key] && typeof middleware[key] !== "function")
      throw new Error(`Exported ${key} must be a function`);
  });
}

async function getOriginalFilename(filename: string) {
  const { sources } = JSON.parse(await fs.readFile(`${filename}.map`, "utf-8"));
  return sources[0];
}

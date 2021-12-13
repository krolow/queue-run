import { install } from "source-map-support";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const handlers = new Map<string, { config: any; handler: any } | null>();

export default async function loadModule<Handler = unknown, Config = unknown>(
  path: string
): Promise<{
  config: Config;
  handler: Handler;
  [key: string]: any;
} | null> {
  if (handlers.has(path)) return handlers.get(path) ?? null;

  try {
    const exports = await import(`background/${path}.js`);
    const handler = exports.handler ?? exports.default;
    const config = exports.config ?? {};
    handlers.set(path, { config, handler });
    return { config, handler };
  } catch (error) {
    console.error(error);
    handlers.set(path, null);
    return null;
  }
}

// Adds source maps for stack traces
install({ environment: "node" });

import { install } from "source-map-support";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const handlers = new Map<string, { config: any; handler: any }>();

export default async function loadModule<Handler = unknown, Config = unknown>(
  name: string
): Promise<{
  config: Config;
  handler: Handler;
}> {
  const module = handlers.get(name);
  if (module) return module;

  const exports = await import(`background/${name}.js`);
  const handler = exports.handler ?? (exports.default as Handler);
  const config = exports.config ?? ({} as Config);
  handlers.set(name, { config, handler });
  return { config, handler };
}

install({ environment: "node" });

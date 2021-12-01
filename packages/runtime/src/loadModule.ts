import { install } from "source-map-support";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const handlers = new Map<string, { config: any; handler: any }>();

export default async function loadModule<Handler = unknown, Config = unknown>(
  // Group, eg queue, topic
  group: string,
  // Name, eg my-job, alerts
  name: string
): Promise<{
  config: Config;
  handler: Handler;
}> {
  const module = handlers.get(name);
  if (module) return module;

  const exports = await import(`background/${group}/${name}.js`);
  const handler = exports.handler ?? exports.default;
  const config = exports.config ?? {};
  handlers.set(name, { config, handler });
  return { config, handler };
}

// Adds source maps for stack traces
install({ environment: "node" });

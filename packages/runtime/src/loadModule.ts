import { QueueConfig, QueueHandler } from "../types";

export const handlers = new Map<
  string,
  { config: QueueConfig; handler: QueueHandler }
>();

export default async function loadModule(queueName: string): Promise<{
  config: QueueConfig;
  handler: QueueHandler;
}> {
  const module = handlers.get(queueName);
  if (module) return module;

  const exports = await import(`background/queue/${queueName}.js`);
  const handler = exports.handler ?? exports.default;
  const config = exports.config ?? {};
  handlers.set(queueName, { config, handler });
  return { config, handler };
}

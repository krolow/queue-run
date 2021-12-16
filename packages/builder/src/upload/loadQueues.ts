import { QueueConfig } from "@queue-run/runtime";
import glob from "fast-glob";
import path from "path";

export default async function loadQueues(
  dirname: string
): Promise<Map<string, QueueConfig>> {
  const filenames = glob.sync("[!_]*.{js,ts}", {
    cwd: path.join(dirname, "backend", "queue"),
    onlyFiles: true,
  });
  console.log(path.join(dirname, "backend", "queue"));
  console.log(filenames);

  const map = await Promise.all(
    filenames.map(async (filename) => {
      const queueName = path.basename(filename, path.extname(filename));
      const exports = await require(filename);
      const handler = exports.handler || exports.default;
      if (typeof handler !== "function")
        throw new Error(
          `The module "${filename}" does not export default/handler function`
        );
      const config = exports.config || {};
      return [queueName, config] as [string, QueueConfig];
    })
  );
  return new Map(map);
}

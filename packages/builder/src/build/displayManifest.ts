import chalk from "chalk";
import {
  HTTPRoute,
  loadManifest,
  QueueService,
  WebSocketRoute,
} from "queue-run";

export default async function displayManifest(dirname: string) {
  const { routes, sockets, queues } = await loadManifest(dirname);

  displayRoutes(routes);
  displaySockets(sockets);
  displayQueues(queues);
}

function displayRoutes(routes: Map<string, HTTPRoute>) {
  console.info(
    chalk.bold.blue("λ: %s"),
    routes.size > 0 ? "API:" : "No routes"
  );
  table(
    Array.from(routes.entries()).map(([path, { original }]) => [path, original])
  );
}

function displaySockets(sockets: Map<string, WebSocketRoute>) {
  console.info(
    chalk.bold.blue("λ: %s"),
    sockets.size > 0 ? "WebSocket:" : "No WebSocket"
  );
  table(
    Array.from(sockets.entries()).map(([path, { original }]) => [
      path,
      original,
    ])
  );
}

function displayQueues(queues: Map<string, QueueService>) {
  console.info(
    chalk.bold.blue("λ: %s"),
    queues.size > 0 ? "Queues:" : "No queues"
  );
  table(
    Array.from(queues.entries()).map(([path, { original }]) => [path, original])
  );
}

function table(rows: [string, string][]) {
  if (rows.length === 0) return;

  const maxWidth = process.stdout.columns / 2 - 2;
  const width = Math.min(
    Math.max(...rows.map(([path]) => path.length), maxWidth / 2),
    maxWidth
  );
  const table = rows.map(([path, original]) =>
    [fit(path, width), fit(original, width)].join("  →  ")
  );
  console.info(
    "%s",
    table
      .sort()
      .map((line) => `   ${line}`)
      .join("\n")
  );
}

function fit(path: string, width: number) {
  return path.length <= width
    ? path.padEnd(width)
    : path.slice(0, width / 2 - 1) + "…" + path.slice(path.length - width / 2);
}

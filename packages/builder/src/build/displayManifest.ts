import { loadManifest } from "queue-run";
import displayTable from "../displayTable.js";

export default async function displayManifest(dirname: string) {
  const manifest = await loadManifest(dirname);

  const routes = tabulate(manifest.routes, (path) =>
    path
      .replace(/^\//, "")
      .replace(/:([a-zA-Z0-9_]+)/gi, "[$1]")
      .replace(/:([a-zA-Z0-9_]+)\*/gi, "[...$1]")
  );
  const socket = tabulate(manifest.socket);
  const queues = tabulate(manifest.queues);
  const schedules = tabulate(manifest.schedules);

  const colWidths = calculate(routes, socket, queues, schedules);

  displayTable({
    rows: routes,
    headers: ["HTTP API", ""],
    options: { flowStyle: true, colWidths },
  });
  process.stdout.write("\n");
  displayTable({
    rows: socket,
    headers: ["WebSocket", ""],
    options: { flowStyle: true, colWidths },
  });
  process.stdout.write("\n");
  displayTable({
    rows: queues,
    headers: ["Queues", ""],
    options: { flowStyle: true, colWidths },
  });
  process.stdout.write("\n");
  displayTable({
    rows: schedules,
    headers: ["Schedules", ""],
    options: { flowStyle: true, colWidths },
  });
  process.stdout.write("\n");
}

function tabulate(
  map: Map<string, { original: string }>,
  // eslint-disable-next-line no-unused-vars
  rename?: (match: string) => string
): [string, string][] {
  return Array.from(map.entries()).map(([match, { original }]) => [
    rename?.(match) ?? match,
    original,
  ]);
}

function calculate(...tables: [string, string][][]): [number, number] {
  const rows = tables.flat(1);
  const min = 10;
  return [
    Math.max(...rows.map(([left]) => left.length), min),
    Math.max(...rows.map(([, right]) => right.length), min),
  ] as [number, number];
}

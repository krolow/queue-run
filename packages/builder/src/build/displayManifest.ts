import { loadManifest } from "queue-run";
import displayTable from "../displayTable.js";

export default async function displayManifest(dirname: string) {
  const manifest = await loadManifest(dirname);

  const routes = tabulate(manifest.routes);
  const socket = tabulate(manifest.socket);
  const queues = tabulate(manifest.queues);
  const schedules = tabulate(manifest.schedules);

  const widths = calculate(routes, socket, queues, schedules);

  displayTable({
    rows: routes,
    headers: ["HTTP API", ""],
    options: { flow: true, widths },
  });
  process.stdout.write("\n");
  displayTable({
    rows: socket,
    headers: ["WebSocket", ""],
    options: { flow: true, widths },
  });
  process.stdout.write("\n");
  displayTable({
    rows: queues,
    headers: ["Queues", ""],
    options: { flow: true, widths },
  });
  process.stdout.write("\n");
  displayTable({
    rows: schedules,
    headers: ["Schedules", ""],
    options: { flow: true, widths },
  });
  process.stdout.write("\n");
}

function tabulate(map: Map<string, { original: string }>): [string, string][] {
  return Array.from(map.entries()).map(([match, { original }]) => [
    match,
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

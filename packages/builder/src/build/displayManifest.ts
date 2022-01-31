import chalk from "chalk";
import { loadManifest } from "queue-run";

export default async function displayManifest(dirname: string) {
  const manifest = await loadManifest(dirname);

  const routes = tabulate(manifest.routes);
  const socket = tabulate(manifest.socket);
  const queues = tabulate(manifest.queues);

  const widths = calculate(routes, socket, queues);

  displayTable({ rows: routes, title: "HTTP API", widths });
  displayTable({ rows: socket, title: "WebSocket", widths });
  displayTable({ rows: queues, title: "Queues", widths });
}

function tabulate(map: Map<string, { original: string }>): [string, string][] {
  return Array.from(map.entries()).map(([match, { original }]) => [
    match,
    original,
  ]);
}

function calculate(...tables: [string, string][][]): [number, number] {
  const rows = tables.flat(1);
  const available = process.stdout.columns - 5;
  const min = 10;
  const max = [
    Math.max(...rows.map(([left]) => left.length), min),
    Math.max(...rows.map(([, right]) => right.length), min),
  ] as [number, number];
  return max[0]! + max[1]! > available
    ? [Math.floor((available / 3) * 2), Math.floor(available / 3)]
    : max;
}

function displayTable({
  rows,
  title,
  widths,
}: {
  rows: [string, string][];
  title: string;
  widths: [number, number];
}) {
  process.stdout.write(` ${title}\n`);
  process.stdout.write(`${chalk.dim("─".repeat(widths[0] + widths[1] + 7))}\n`);
  if (rows.length > 0) {
    for (const [left, right] of rows) {
      process.stdout.write(
        ` ${fit(left, widths[0])}  ${chalk.dim("→")}  ${fit(
          right,
          widths[1]
        )}\n`
      );
    }
  } else process.stdout.write(` None\n`);
  process.stdout.write("\n");
}

function fit(path: string, width: number) {
  return path.length <= width
    ? path.padEnd(width)
    : path.slice(0, width / 2 - 1) + "…" + path.slice(path.length - width / 2);
}

import { loadManifest } from "queue-run";

export default async function displayManifest(dirname: string) {
  const { routes, sockets, queues } = await loadManifest(dirname);

  const tables = [tabulate(routes), tabulate(sockets), tabulate(queues)];
  const widths = calculate(tables);

  displayTable({
    missing: "No routes",
    rows: tables[0]!,
    title: "API",
    widths,
  });
  displayTable({
    missing: "No WebSocket",
    rows: tables[1]!,
    title: "WebSocket",
    widths,
  });
  displayTable({
    missing: "No queues",
    rows: tables[2]!,
    title: "Queues",
    widths,
  });
}

function tabulate(map: Map<string, { original: string }>): [string, string][] {
  return Array.from(map.entries()).map(([match, { original }]) => [
    match,
    original,
  ]);
}

function calculate(tables: [string, string][][]): [number, number] {
  const rows = tables.flat(1);
  const available = process.stdout.columns - 10;
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
  missing,
  rows,
  title,
  widths,
}: {
  missing: string;
  rows: [string, string][];
  title: string;
  widths: [number, number];
}) {
  if (rows.length === 0) {
    console.info("λ: %s", missing);
    return;
  }

  console.info("λ: %s:", title);
  console.info(
    "%s",
    rows
      .sort()
      .map(([left, right]) => [fit(left, widths[0]), fit(right, widths[1])])
      .map(([left, right]) => `   ${left}  →  ${right}`)
      .join("\n")
  );
}

function fit(path: string, width: number) {
  return path.length <= width
    ? path.padEnd(width)
    : path.slice(0, width / 2 - 1) + "…" + path.slice(path.length - width / 2);
}

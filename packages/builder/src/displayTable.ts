/**
 * Renders a table.
 *
 * @param headers Table headers
 * @param rows Table rows
 * @param options Display options
 * @param options.flow If true, use flow layout ("cell1 → cell2 → cell3"),
 * otherwise use standard layout ("cell1 │ cell2 │ cell3")
 * @param options.wrap If true, wrap long cells values on multiple lines,
 * otherwise truncate long cells values
 * @param options.fullWidth If true, use full screen width
 * @params options.widths Specify widths for some/all columns
 *
 * If cell value is number or Date, it will be formatted for the current locale.
 */

export default function displayTable({
  headers,
  options,
  rows,
}: {
  headers: string[];
  rows: (string | number | Date | null)[][];
  options?: {
    flow?: boolean;
    fullWidth?: boolean;
    widths?: number[];
    wrap?: boolean;
  };
}) {
  const formatted = formatCells(rows);
  const widths = colWidths({
    fullWidth: options?.fullWidth ?? false,
    headers,
    rows: formatted,
    widths: options?.widths ?? [],
  });
  render({
    flow: options?.flow ?? false,
    headers,
    rows: formatted,
    widths,
    wrap: options?.wrap ?? false,
  });
}

function formatCells(rows: (string | number | Date | null)[][]): string[][] {
  return rows.map((row) =>
    row.map((cell) =>
      typeof cell === "number"
        ? cell.toLocaleString()
        : cell instanceof Date
        ? cell.toLocaleString()
        : cell?.toString() ?? ""
    )
  );
}

// eslint-disable-next-line sonarjs/cognitive-complexity
function colWidths({
  fullWidth,
  headers,
  rows,
  widths: userWidths,
}: {
  fullWidth: boolean;
  headers: string[];
  rows: string[][];
  widths: number[];
}): number[] {
  const fixed = headers.map(
    (_, index) => typeof userWidths[index] === "number"
  );
  const widths = headers.map((header, index) =>
    fixed[index]
      ? userWidths[index]!
      : Math.max(
          header?.length ?? 0,
          ...rows.map((row) => row[index]?.length ?? 0)
        )
  );
  const available = process.stdout.columns ?? 80;

  if (fullWidth) {
    while (widths.reduce((acc, width) => acc + width + 3, 1) < available) {
      const min = Math.min(...widths.filter((_, index) => !fixed[index]));
      const index = widths.findIndex(
        (width, index) => !fixed[index] && width === min
      );
      if (index === -1) break;
      widths[index] = widths[index]! + 1;
    }
  }
  while (widths.reduce((acc, width) => acc + width + 3, 1) > available) {
    const max = Math.max(...widths);
    const index = widths.findIndex(
      (width, index) => !fixed[index] && width === max
    );
    if (index === -1) break;
    widths[index] = widths[index]! - 1;
  }
  return widths;
}

// eslint-disable-next-line sonarjs/cognitive-complexity
function render({
  flow,
  headers,
  rows,
  widths,
  wrap,
}: {
  flow: boolean;
  headers: string[];
  rows: string[][];
  widths: number[];
  wrap: boolean;
}) {
  process.stdout.write(
    " " +
      headers
        .map((header, i) => fit(header, widths[i]!))
        .join(chalk.dim(flow ? "   " : " │ ")) +
      "\n"
  );
  if (flow) {
    process.stdout.write(
      chalk.dim(
        "─".repeat(widths.reduce((acc, width) => acc + width + 3, 1)) + "\n"
      )
    );
  } else {
    process.stdout.write(
      chalk.dim(
        "─" + widths.map((width) => "─".repeat(width)).join("─┼─") + "─\n"
      )
    );
  }
  for (const row of rows) {
    let cells = row;
    while (cells.some((cell) => cell)) {
      process.stdout.write(
        " " +
          cells
            .map((cell, i) =>
              wrap
                ? cell.slice(0, widths[i]).padEnd(widths[i]!)
                : fit(cell, widths[i]!)
            )
            .join(chalk.dim(flow ? " → " : " │ ")) +
          "\n"
      );
      if (wrap) cells = cells.map((cell, i) => cell.slice(widths[i]));
      else break;
    }
  }
}

function fit(cell: string, width: number) {
  return cell.length <= width
    ? cell.padEnd(width)
    : cell.slice(0, width / 2 - 1) + "…" + cell.slice(cell.length - width / 2);
}

import chalk from "chalk";

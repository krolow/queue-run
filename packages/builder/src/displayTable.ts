/**
 * Display options.
 */
type DisplayOptions = {
  /**
   * You can set the width for some or all columns.
   *
   * Columns that do not have a fixed width will expand/shrink based on the
   * screen width.
   */
  colWidths?: (number | undefined)[];

  /**
   * If true, uses the flow style: " cell1 → cell2 → cell3 "
   *
   * Otherwise uses standard borders: " cell1 │ cell2 │ cell3 "
   */
  flowStyle?: boolean;

  /**
   * If true, expand table to fill the terminal width. Only applicable when
   * stdout is a terminal.
   */
  fullWidth?: boolean;

  /**
   * If true (default), cells that are too long will wrap across multiple lines.
   *
   * Otherwise, long values are truncated, eg "123456789" becomes "123…789"
   */
  wrapCells?: boolean;
};

/**
 * Renders a table.
 *
 * @param headers Table headers, any header can be empty string or null
 * @param rows Table rows (string, number, data, or null)
 * @param options Display options
 * @param options.colWidths Set fixed width for some or all columns
 * @param options.flowStyle If true, uses the flow style (" cell1 → cell2 →
 * cell3 "), otherwise uses standard borders (" cell1 │ cell2 │ cell3 ")
 * @param options.fullWidth If true, expand table to fill the terminal width
 * @param options.wrapCells If true, cells that are too long will wrap across
 * multiple lines
 *
 * Uses `toLocaleString()` to format numbers and dates, eg in US locale they
 * would render as "1,234" and "2/7/2022, 4:11:26 PM".
 *
 * If options.fullWidth is true, and stdout is a terminal, the table will expand
 * to fill the screen, except for columns that have a fixed width.
 *
 * If stdout is a terminal, and the table is too wide, columns that are not
 * fixed width will shrink.
 *
 * Cells that are too long to fit will either wrap (wrapCells = true) across
 * multiple lines, or get truncated (eg "123456789" becomes "123…789").
 */
export default function displayTable({
  headers,
  options,
  rows,
}: {
  headers: (string | undefined)[];
  rows: (string | number | Date | null | undefined)[][];
  options?: DisplayOptions;
}) {
  const columns = Math.max(headers.length, ...rows.map((row) => row.length));
  const formatted = formatCells(rows);
  const widths = colWidths({
    columns,
    fullWidth: options?.fullWidth ?? false,
    headers,
    rows: formatted,
    fixedWidths: options?.colWidths ?? [],
  });
  render({
    flowStyle: options?.flowStyle ?? false,
    headers,
    rows: formatted,
    widths,
    wrapCells: options?.wrapCells ?? false,
  });
}

function formatCells(
  rows: (string | number | Date | null | undefined)[][]
): (string | undefined)[][] {
  return rows.map((row) =>
    row.map((cell) =>
      typeof cell === "number"
        ? cell.toLocaleString()
        : cell instanceof Date
        ? cell.toLocaleString()
        : cell?.toString()
    )
  );
}

// eslint-disable-next-line sonarjs/cognitive-complexity
function colWidths({
  columns,
  fullWidth,
  headers,
  rows,
  fixedWidths,
}: {
  columns: number;
  fullWidth: boolean;
  headers: (string | undefined)[];
  rows: (string | undefined)[][];
  fixedWidths: (number | undefined)[];
}): number[] {
  const isFixed = Array.from(
    { length: columns },
    (_, index) => typeof fixedWidths[index] === "number"
  );
  const widths = isFixed.map((isFixed, index) =>
    isFixed
      ? fixedWidths[index]!
      : Math.max(
          headers[index]?.length ?? 0,
          ...rows.map((row) => row[index]?.length ?? 0)
        )
  );
  const available = process.stdout.columns;
  if (!available) return widths;

  if (fullWidth) {
    while (widths.reduce((acc, width) => acc + width + 3, 1) < available) {
      const min = Math.min(...widths.filter((_, index) => !isFixed[index]));
      const index = widths.findIndex(
        (width, index) => !isFixed[index] && width === min
      );
      if (index === -1) break;
      widths[index] = widths[index]! + 1;
    }
  }
  while (widths.reduce((acc, width) => acc + width + 3, 1) > available) {
    const max = Math.max(...widths);
    const index = widths.findIndex(
      (width, index) => !isFixed[index] && width === max
    );
    if (index === -1) break;
    widths[index] = widths[index]! - 1;
  }
  return widths;
}

// eslint-disable-next-line sonarjs/cognitive-complexity
function render({
  flowStyle,
  headers,
  rows,
  widths,
  wrapCells,
}: {
  flowStyle: boolean;
  headers: (string | undefined)[];
  rows: (string | undefined)[][];
  widths: number[];
  wrapCells: boolean;
}) {
  process.stdout.write(
    " " +
      headers
        .map((header, i) => fit(header ?? "", widths[i]!))
        .join(dim(flowStyle ? "   " : " │ ")) +
      "\n"
  );
  if (flowStyle) {
    process.stdout.write(
      dim("─".repeat(widths.reduce((acc, width) => acc + width + 3, 1)) + "\n")
    );
  } else {
    process.stdout.write(
      dim("─" + widths.map((width) => "─".repeat(width)).join("─┼─") + "─\n")
    );
  }
  for (const row of rows) {
    let cells = row;
    while (cells.some((cell) => cell)) {
      process.stdout.write(
        " " +
          cells
            .map((cell, i) =>
              wrapCells
                ? (cell?.slice(0, widths[i]) ?? "").padEnd(widths[i]!)
                : fit(cell ?? "", widths[i]!)
            )
            .join(dim(flowStyle ? " → " : " │ ")) +
          "\n"
      );
      if (wrapCells) cells = cells.map((cell, i) => cell?.slice(widths[i]));
      else break;
    }
  }
}

function fit(cell: string, width: number) {
  return cell.length <= width
    ? cell.padEnd(width)
    : cell.slice(0, width / 2 - 1) + "…" + cell.slice(cell.length - width / 2);
}

function dim(text: string) {
  return process.stdout.isTTY ? `\u001B[2m${text}\u001B[0m` : text;
}

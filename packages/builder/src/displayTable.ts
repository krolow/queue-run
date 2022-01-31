export default function displayTable(headers: string[], table: string[][]) {
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...table.map((row) => row[index]!.length))
  );
  const border = headers.length * 3 - 1;
  const available = Math.max(process.stdout.getWindowSize()[0], 30);
  while (border + widths.reduce((acc, width) => acc + width) > available) {
    const max = Math.max(...widths);
    const index = widths.findIndex((width) => width === max);
    widths[index] = widths[index]! - 1;
  }

  process.stdout.write(
    " " +
      headers
        .map((header, i) => header.padEnd(widths[i]!))
        .join(chalk.dim(" │ ")) +
      "\n"
  );
  process.stdout.write(
    chalk.dim(
      "─" + widths.map((width) => "─".repeat(width)).join("─┼─") + "─\n"
    )
  );
  for (const row of table) {
    let cells = row;
    while (cells.some((cell) => cell)) {
      process.stdout.write(
        " " +
          cells
            .map((cell, i) => cell.slice(0, widths[i]).padEnd(widths[i]!))
            .join(chalk.dim(" │ ")) +
          "\n"
      );
      cells = cells.map((cell, i) => cell.slice(widths[i]));
    }
  }
}

import chalk from "chalk";

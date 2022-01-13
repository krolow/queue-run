import chalk from "chalk";
import { formatWithOptions } from "node:util";

declare namespace NodeJS {
  interface ProcessEnv {
    readonly NODE_ENV: "development" | "production" | "test";
  }
}

const showDebug =
  process.env.NODE_ENV === "development"
    ? process.env.DEBUG !== "false"
    : process.env.DEBUG === "true";

global.console.debug = (message, ...args) => {
  if (!showDebug) return;
  const colors = process.stdout.hasColors && process.stdout.hasColors();
  process.stdout.write(
    formatWithOptions({ colors }, chalk.dim(message), ...args) + "\n"
  );
};

global.console.log = (message, ...args) => {
  const colors = process.stdout.hasColors && process.stdout.hasColors();
  process.stdout.write(formatWithOptions({ colors }, message, ...args) + "\n");
};

global.console.info = (message, ...args) => {
  const colors = process.stdout.hasColors && process.stdout.hasColors();
  process.stdout.write(
    formatWithOptions({ colors }, chalk.blue(message), ...args) + "\n"
  );
};

global.console.warn = (message, ...args) => {
  const colors = process.stderr.hasColors && process.stderr.hasColors();
  process.stderr.write(
    formatWithOptions({ colors }, chalk.bold.yellow(message), ...args) + "\n"
  );
};

global.console.error = (message, ...args) => {
  const colors = process.stderr.hasColors && process.stderr.hasColors();
  process.stderr.write(
    formatWithOptions({ colors }, chalk.bold.red(message), ...args) + "\n"
  );
};

import chalk, { ChalkInstance } from "chalk";
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

const formatOptions = {
  compact: true,
  colors: process.stdout.hasColors && process.stdout.hasColors(),
};

global.console.debug = (...args) =>
  showDebug ? writeLog("debug", ...args) : undefined;
global.console.log = (...args) => writeLog("log", ...args);
global.console.info = (...args) => writeLog("info", ...args);
global.console.warn = (...args) => writeLog("warn", ...args);
global.console.error = (...args) => writeLog("error", ...args);

function writeLog(level: string, message: unknown, ...args: unknown[]) {
  const colors: { [key: string]: ChalkInstance } = {
    debug: chalk.dim,
    error: chalk.bold.red,
    info: chalk.blue,
    log: chalk.white,
    warn: chalk.bold.yellow,
  };
  const formatted = formatWithOptions(
    formatOptions,
    (message =
      typeof message === "string" ? colors[level]?.(message) : message),
    ...args
  );
  const stream =
    level === "error" || level === "warn" ? process.stderr : process.stdout;
  if (process.env.AWS_LAMBDA_LOG_GROUP_NAME)
    stream.write(formatted.replace(/\n/g, "\r") + "\n");
  else stream.write(formatted + "\n");
}

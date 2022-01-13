import chalk, { ChalkInstance } from "chalk";
import { formatWithOptions } from "node:util";

/**
 * The logging function. console.log and friends redirect here.
 *
 * - console.debug is controlled by the DEBUG environment variable
 * - console.log uses the level "verbose" to differentiate from console.info
 * - The first argument is typically but not necessarily the formatting string
 *
 * @param level The log level
 * @param args The log arguments
 */
// eslint-disable-next-line no-unused-vars
type LoggingFunction = (level: LogLevel, args: unknown[]) => void;

type LogLevel = "debug" | "verbose" | "info" | "warn" | "error";

let logger: LoggingFunction = stdio;

const showDebug =
  process.env.NODE_ENV === "development"
    ? process.env.DEBUG !== "false"
    : process.env.DEBUG === "true";

global.console.debug = (...args: unknown[]) =>
  showDebug ? logger("debug", args) : undefined;
global.console.log = (...args: unknown[]) => logger("verbose", args);
global.console.info = (...args: unknown[]) => logger("info", args);
global.console.warn = (...args: unknown[]) => logger("warn", args);
global.console.error = (...args: unknown[]) => logger("error", args);

/**
 * Use this to replace the logging function, or intercept logging calls.
 *
 * If called with no arguments, returns the current logger function.
 *
 * If called with a single argument, sets the new logger function, and returns
 * the previous one.
 *
 * @param newLogger The new logger function
 * @returns The current/previous logger function
 */
export default function logging(newLogger?: LoggingFunction) {
  if (newLogger) {
    const previous = logger;
    logger = newLogger;
    return previous;
  } else return logger;
}

const colors: Record<LogLevel, ChalkInstance> = {
  debug: chalk.dim,
  error: chalk.bold.red,
  info: chalk.blue,
  verbose: chalk.white,
  warn: chalk.bold.yellow,
};

const formatOptions = {
  compact: true,
  colors: process.stdout.hasColors && process.stdout.hasColors(),
};

// Default logger uses stdout/stderr, supports colors when running in terminal
function stdio(level: LogLevel, args: unknown[]) {
  const [message, ...rest] = args;
  // we want to apply a color to the message, but not if the user is doing
  // console.log({ variable }).
  const withColor =
    typeof message === "string" ? colors[level]?.(message) : message;

  const formatted = formatWithOptions(formatOptions, withColor, ...rest);
  const stream =
    level === "error" || level === "warn" ? process.stderr : process.stdout;
  stream.write(formatted + "\n");
}

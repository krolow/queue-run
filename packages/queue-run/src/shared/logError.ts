import chalk from "chalk";
import { URL } from "url";
import { Request } from "../http/fetch"; // don't import from http to avoid circular dependency
import { QueueHandlerMetadata } from "../queue";

export type OnError = (
  error: Error,
  reference: unknown
) => Promise<void> | void;

export async function logError(error: Error, reference: unknown) {
  if (reference instanceof Request) {
    console.error(
      chalk.bold.red('"%s %s" error: %s'),
      reference.method,
      new URL(reference.url).pathname,
      String(error),
      error.stack
    );
  } else if (
    reference instanceof Object &&
    "jobID" in reference &&
    "queueName" in reference
  ) {
    const { jobID, queueName } = reference as QueueHandlerMetadata;
    console.error(
      chalk.bold.red("Job failed on %s: %s: %s"),
      queueName,
      jobID,
      String(error),
      error.stack
    );
  }
}

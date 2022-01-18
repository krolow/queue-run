import { CloudWatchLogs } from "@aws-sdk/client-cloudwatch-logs";
import chalk from "chalk";
import { Command } from "commander";
import ms from "ms";
import { loadProject } from "./project.js";

const command = new Command("logs")
  .description("view server logs (Ctrl+C to stop)")
  .option("-h --hours <n>", "number of hours to look back", "1")
  .option("--once", "show most recent logs and stop")
  .action(async ({ hours, once }: { hours: string; once: boolean }) => {
    const { name } = await loadProject();

    let nextToken = await showEvents({ name, hours: Number(hours) });
    while (!once) nextToken = await showEvents({ name, nextToken });
  });

async function showEvents({
  hours = 0,
  name,
  nextToken,
}: {
  hours?: number;
  name: string;
  nextToken?: string | undefined;
}): Promise<string> {
  const cw = new CloudWatchLogs({});
  const result = await cw.filterLogEvents({
    logGroupName: `/aws/lambda/qr-${name}`,
    ...(nextToken
      ? { nextToken }
      : { startTime: Date.now() - ms("1h") * hours }),
  });

  const events = result.events!;
  if (!events.length) return nextToken!;

  for (const event of events) {
    const timestamp = new Date(event.timestamp!).toLocaleString();
    const message = event.message!.replace(/\r/g, "\n");
    const level = message.match(/^\[(\w+)\] /)?.[1];
    const trace = /^(START|END|REPORT) RequestId: /.test(message);
    const color = trace
      ? chalk.dim
      : (level &&
          {
            DEBUG: chalk.dim,
            INFO: chalk.blue,
            WARN: chalk.bold.yellow,
            ERROR: chalk.bold.red,
          }[level]) ||
        chalk.white;
    process.stdout.write(`${chalk.dim(timestamp)}: ${color(message)}\n`);
  }
  return await showEvents({ name, nextToken: result.nextToken });
}

export default command;

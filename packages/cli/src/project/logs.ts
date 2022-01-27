import { CloudWatchLogs } from "@aws-sdk/client-cloudwatch-logs";
import chalk from "chalk";
import { Command } from "commander";
import ms from "ms";
import ora from "ora";
import { loadCredentials } from "./project.js";

const command = new Command("logs")
  .description("view server logs (Ctrl+C to stop)")
  .option("-h --hours <n>", "number of hours to look back", "1")
  .option("--once", "show most recent logs and stop")
  .addHelpText(
    "after",
    `
🧘 We're using CloudWatch here. It takes few seconds before logs are available.
`
  )
  .action(async ({ hours, once }: { hours: string; once: boolean }) => {
    const { name, awsRegion } = await loadCredentials();

    keystrokes();
    const cw = new CloudWatchLogs({ region: awsRegion });
    let nextToken = await showEvents({ cw, name, hours: Number(hours) });
    while (!once) nextToken = await showEvents({ cw, name, nextToken });
  });

async function showEvents({
  cw,
  hours = 0,
  name,
  nextToken,
}: {
  cw: CloudWatchLogs;
  hours?: number;
  name: string;
  nextToken?: string | undefined;
}): Promise<string> {
  const spinner = ora("Fetching logs...").start();
  const result = await cw.filterLogEvents({
    logGroupName: `/aws/lambda/qr-${name}`,
    ...(nextToken
      ? { nextToken }
      : { startTime: Date.now() - ms("1h") * hours }),
  });
  spinner.stop();

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
  return await showEvents({ cw, name, nextToken: result.nextToken });
}

function keystrokes() {
  process.stdin.on("data", (data) => {
    const key = data[0]!;
    switch (key) {
      case 3: {
        // Ctrl+C
        process.exit(0);
        break;
      }
      case 12: {
        // Ctrl+L
        // ANSI code to clear terminal
        process.stdout.write("\u001B[2J\u001B[0;0f");
        break;
      }
      case 13: {
        // Enter
        process.stdout.write("\n");
        break;
      }
      default: {
        if (key < 32)
          console.info(
            "   %s",
            chalk.gray(["Ctrl+C to exit", "Ctrl+L to clear screen"].join(", "))
          );
        process.stdout.write(String.fromCharCode(key));
      }
    }
  });
  process.stdin.setRawMode(true);
  process.stdin.resume();
}

export default command;

import { CloudWatchLogs } from "@aws-sdk/client-cloudwatch-logs";
import chalk from "chalk";
import { Command, Option } from "commander";
import ms from "ms";
import ora from "ora";
import { loadCredentials } from "./project.js";
import { localTimestamp } from "./timestamp.js";

const command = new Command("logs")
  .description("view server logs")
  .addOption(
    new Option("-h --hours <hours>", "how many hours to look back").default(
      0.5,
      "30 minutes"
    )
  )
  .option("--watch", "continuously watch logs", true)
  .option("--no-watch", "show most recent logs and stop")
  .addHelpText(
    "after",
    `\n
🧘 We're using CloudWatch here. There's a few seconds delay between when the logs are written and when they appear here.

💡 You can use Ctrl+C to stop, or Ctrl+L to clear the screen
`
  )
  .action(async ({ hours, watch }: { hours: string; watch: boolean }) => {
    const { name, awsRegion } = await loadCredentials();

    keystrokes();
    const cw = new CloudWatchLogs({ region: awsRegion });
    let nextToken = await showEvents({ cw, name, hours: Number(hours) });
    while (watch) nextToken = await showEvents({ cw, name, nextToken });
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
    const timestamp = localTimestamp(new Date(event.timestamp!));
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

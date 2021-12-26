import { moduleLoader } from "@queue-run/builder";
import chalk from "chalk";
import { readFile } from "fs/promises";
import ora from "ora";
import readline from "readline";
import envVariables from "./envVariables";
import { newLocalStorage } from "./newLocalStorage";

export default async function queueMessage(
  queueName: string,
  message: string,
  { port, group }: { port: number; group?: string }
) {
  const payload = parseMessage(await readPayload(message));

  const spinner = ora(`Loading queue handler for ${queueName}`).start();
  try {
    envVariables(port);
    await moduleLoader({ dirname: process.cwd() });
    newLocalStorage().queueJob({
      groupID: group,
      payload,
      queueName,
    });

    spinner.succeed();
  } catch (error) {
    spinner.stop();
    throw error;
  }
}

async function readPayload(message: string): Promise<string> {
  if (!message) {
    console.info(
      chalk.bold.blue(
        "Type your message then Ctrl+D on an empty line (Ctrl+C to exit)"
      )
    );
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: "",
    });
    rl.on("SIGINT", () => process.exit(-1));
    const lines = [];
    for await (const line of rl) lines.push(line);
    return lines.join("\n");
  }
  if (!message || message === "-") return await readFile("/dev/stdin", "utf8");
  else if (message.startsWith("@"))
    return await readFile(message.slice(1), "utf-8");
  else return message;
}

function parseMessage(message: string): string | object {
  try {
    return JSON.parse(message);
  } catch {
    return message;
  }
}

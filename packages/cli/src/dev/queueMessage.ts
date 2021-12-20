import { moduleLoader } from "@queue-run/builder";
import { loadModule, pushMessage } from "@queue-run/runtime";
import chalk from "chalk";
import { readFile } from "fs/promises";
import ora from "ora";
import readline from "readline";
import envVariables from "./envVariables";

export default async function queueMessage(
  queueName: string,
  message: string,
  { port, group }: { port: number; group?: string }
) {
  const spinner = ora("Loading job handler").start();
  try {
    envVariables(port);
    await moduleLoader({ dirname: process.cwd() });

    const module = await loadModule(`queues/${queueName}`);
    if (!module) throw new Error(`Queue ${queueName} not found`);

    spinner.succeed();
  } catch (error) {
    spinner.stop();
    throw error;
  }
  const body = maybeJSON(await readMessageBody(message));
  await pushMessage({ body, groupId: group, params: {}, queueName });
}

async function readMessageBody(message: string): Promise<string> {
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

function maybeJSON(body: string) {
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

import chalk from "chalk";
import fs from "fs/promises";
import ora from "ora";
import path from "path";
import { loadQueues } from "queue-run";
import { buildProject } from "queue-run-builder";
import readline from "readline";
import envVariables from "./envVariables";
import { events, newLocalStorage } from "./newLocalStorage";

const sourceDir = process.cwd();
const buildDir = path.resolve(".queue-run");

export default async function queueMessage(
  queueName: string,
  message: string,
  { port, group }: { port: number; group?: string }
) {
  const payload = parseMessage(await readPayload(message));
  const spinner = ora(`Loading queue handler for ${queueName}`).start();
  try {
    envVariables(port);

    await fs.mkdir(buildDir, { recursive: true });
    await buildProject({ buildDir, sourceDir });
    process.chdir(buildDir);

    const queues = await loadQueues();
    if (!queues.has(queueName)) throw new Error(`No queue named ${queueName}`);

    spinner.succeed();
  } catch (error) {
    spinner.stop();
    throw error;
  }
  await newLocalStorage(port).queueJob({
    groupID: group,
    payload,
    queueName,
  });
  await new Promise((resolve) => events.once("idle", resolve));
}

async function readPayload(message: string): Promise<string> {
  if (!message) {
    if (process.stdin.isTTY) {
      console.info(
        chalk.bold.blue(
          "Type your message then Ctrl+D on an empty line (Ctrl+C to exit)"
        )
      );
    }
    const rl = readline.createInterface({
      input: process.stdin,
      prompt: "",
    });
    rl.on("SIGINT", () => process.exit(-1));
    const lines = [];
    for await (const line of rl) lines.push(line);
    return lines.join("\n");
  }
  if (!message || message === "-")
    return await fs.readFile("/dev/stdin", "utf8");
  else if (message.startsWith("@"))
    return await fs.readFile(message.slice(1), "utf-8");
  else return message;
}

function parseMessage(message: string): string | object {
  try {
    return JSON.parse(message);
  } catch {
    return message;
  }
}

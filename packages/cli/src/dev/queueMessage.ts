import chalk from "chalk";
import fs from "fs/promises";
import readline from "readline";
import { URL } from "url";

export default async function queueMessage(
  queueName: string,
  message: string,
  { port, group }: { port: number; group?: string }
) {
  const payload = await readPayload(message);
  const path = group
    ? `/$queues/${queueName}/${group}`
    : `/$queues/${queueName}`;

  await fetch(new URL(path, `http://localhost:${port}`).href, {
    method: "POST",
    body: payload,
  });
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
    return await fs.readFile("/dev/stdin", "utf-8");
  else if (message.startsWith("@"))
    return await fs.readFile(message.slice(1), "utf-8");
  else return message;
}

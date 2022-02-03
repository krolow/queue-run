import { SQS } from "@aws-sdk/client-sqs";
import { Command, Option } from "commander";
import fs from "node:fs/promises";
import readline from "node:readline";
import { URL } from "node:url";
import ora from "ora";
import invariant from "tiny-invariant";
import { loadCredentials } from "./project.js";

const command = new Command("queue")
  .description("runs the job using queue handler")
  .argument("<queue>", "the queue name")
  .argument(
    "[payload]",
    'JSON or plain text (use @name to read from a file, "-" to read from stdin)'
  )
  .addOption(
    new Option("-p, --port <port>", "port to run the server on")
      .env("PORT")
      .default(8000)
  )
  .option("-g --group <group>", "group ID (FIFO queues only)")
  .option("--prod", "run the job in production", false)
  .addHelpText(
    "after",
    `\n
Queue payload from command line:
$ npx queue-run dev queue my-queue '{ "foo": "bar" }'

Queue payload from a file to standard queue:
$ npx queue-run dev queue my-queue @payload.json
  
Queue payload from stdin to FIFO queue:
$ cat payload.json | npx queue-run dev queue my-queue.fifo -g groupA
  `
  )
  .action(
    async (
      queue: string,
      input: string | undefined,
      {
        group,
        port,
        prod,
      }: {
        group: string | undefined;
        port: number;
        prod: boolean | undefined;
      }
    ) => {
      if (prod) await queueInProduction({ group, input, queue });
      else await queueInDevelopment({ group, input, port, queue });
    }
  );

async function queueInProduction({
  group,
  input,
  queue,
}: {
  input: string | undefined;
  group: string | undefined;
  queue: string;
}) {
  const { name, awsRegion: region } = await loadCredentials();

  const payload = await readPayload(input);
  if (!payload) throw new Error("Cannot queue empty message");

  const spinner = ora("Queuing job").start();
  const sqs = new SQS({ region });

  try {
    const { QueueUrl } = await sqs.getQueueUrl({
      QueueName: `qr-${name}__${queue}`,
    });
    invariant(QueueUrl, `Queue ${queue} not found`);

    await sqs.sendMessage({
      QueueUrl,
      MessageBody: payload || "",
      ...(group ? { MessageGroupId: group } : {}),
    });
  } catch (error) {
    if (
      (error as { name?: string }).name ===
      "AWS.SimpleQueueService.NonExistentQueue"
    )
      throw new Error(`Queue ${queue} not found`);
    else throw error;
  } finally {
    spinner.stop();
  }
}

async function queueInDevelopment({
  group,
  input,
  port,
  queue,
}: {
  input: string | undefined;
  group: string | undefined;
  port: number;
  queue: string;
}) {
  const payload = await readPayload(input);
  if (!payload) throw new Error("Cannot queue empty message");

  const path = group ? `/$queues/${queue}/${group}` : `/$queues/${queue}`;
  await fetch(new URL(path, `http://localhost:${port}`).href, {
    method: "POST",
    body: payload,
  });
}

async function readPayload(payload: string | undefined): Promise<string> {
  if (payload === "-") return await fs.readFile("/dev/stdin", "utf-8");
  else if (payload?.startsWith("@"))
    return await fs.readFile(payload.slice(1), "utf-8");
  else if (payload) return payload;
  else {
    if (process.stdin.isTTY) {
      console.info(
        "Type your message then Ctrl+D on an empty line (Ctrl+C to exit)"
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
}

export default command;

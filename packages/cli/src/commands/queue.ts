import { SQS } from "@aws-sdk/client-sqs";
import { Command } from "commander";
import ora from "ora";
import { loadCredentials } from "../shared/config.js";
import readPayload from "../shared/read_payload.js";

const command = new Command("queue")
  .description("manually queue job in production")
  .argument("<queue>", "the queue name")
  .argument(
    "[payload]",
    'JSON or plain text (use @name to read from a file, "-" to read from stdin)'
  )
  .option("-g --group <group>", "group ID (FIFO queues only)")
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
      }: {
        group: string | undefined;
      }
    ) => {
      const { name, awsRegion: region } = await loadCredentials();

      const payload = await readPayload(input);
      if (!payload) throw new Error("Cannot queue empty message");

      const spinner = ora("Queuing job").start();
      const sqs = new SQS({ region });

      try {
        const { QueueUrl } = await sqs.getQueueUrl({
          QueueName: `qr-${name}__${queue}`,
        });
        await sqs.sendMessage({
          QueueUrl,
          MessageBody: payload || "",
          ...(group ? { MessageGroupId: group } : {}),
        });
        spinner.succeed();
      } catch (error) {
        spinner.fail();
        if (
          (error as { name?: string }).name ===
          "AWS.SimpleQueueService.NonExistentQueue"
        )
          throw new Error(`Queue "${queue}" not found`);
        else throw error;
      }
    }
  );

export default command;

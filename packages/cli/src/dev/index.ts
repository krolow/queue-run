import { Command, Option } from "commander";
import devServer from "./devServer.js";
import queueMessage from "./queueMessage.js";

const command = new Command("dev").description("run the development server");

export default command;

command
  .command("start", { isDefault: true })
  .description("start the development server (default command)")
  .addOption(
    new Option("-p, --port <port>", "port to run the server on")
      .env("PORT")
      .default(8000)
      .makeOptionMandatory()
  )
  .addOption(
    new Option(
      "-e, --environment <environment...>",
      "environment variables (format: name=value)"
    ).default([])
  )
  .addHelpText(
    "after",
    `\n
The development server loads environment variables from the file .env.

The --environment option can be used to override these environment variables.
`
  )
  .action(
    async ({ port, environment }: { port: number; environment: string[] }) => {
      const envVars = getEnvVars(environment);
      await devServer({ port, envVars });
    }
  );

command
  .command("queue")
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
      .makeOptionMandatory()
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
      payload: string | undefined,
      {
        port,
        group,
      }: {
        port: number;
        group: string | undefined;
      }
    ) => await queueMessage({ group, payload, port, queue })
  );

command
  .command("schedule")
  .description("runs the scheduled job")
  .argument("<name>", "the schedule name")
  .addOption(
    new Option("-p, --port <port>", "port to run the server on")
      .env("PORT")
      .default(8000)
      .makeOptionMandatory()
  )
  .action(async (name: string, { port }: { port: string }) => {
    await fetch(
      new URL(`/$schedules/${name}`, `http://localhost:${port}`).href,
      { method: "POST" }
    );
  });

function getEnvVars(environment: string[]): Map<string, string> {
  return environment.reduce((map, cur) => {
    const match = cur.match(/^([^=]+)=(.*)$/)?.slice(1);
    if (!match)
      throw new Error('Environment variable must be in the form "name=value"');
    const [key, value] = match;
    return map.set(key, value);
  }, new Map());
}

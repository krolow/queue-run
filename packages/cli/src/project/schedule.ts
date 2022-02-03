import { Lambda } from "@aws-sdk/client-lambda";
import { Command, Option } from "commander";
import ora from "ora";
import { loadCredentials } from "./project.js";

const command = new Command("schedule")
  .description("manually run a scheduled job")
  .argument("<name>", "name of the scheduled job")
  .option("--prod", "run the job in production", false)
  .addOption(
    new Option("-p, --port <port>", "port to run the server on")
      .env("PORT")
      .default(8000)
  )
  .action(
    async (
      schedule,
      {
        prod,
        port,
      }: {
        prod: boolean | undefined;
        port: number;
      }
    ) => {
      if (prod) await scheduleInProduction(schedule);
      else await scheduleInDevelopment(schedule, port);
    }
  );

async function scheduleInProduction(schedule: string) {
  const { name, awsRegion: region } = await loadCredentials();
  const spinner = ora("Triggering scheduled job").start();
  const lambda = new Lambda({ region });
  const lambdaName = `qr-${name}`;
  const payload = {
    source: "cli.schedule",
    schedule,
  };
  await lambda.invoke({
    FunctionName: lambdaName,
    InvocationType: "Event",
    Payload: Buffer.from(JSON.stringify(payload)),
  });
  spinner.stop();
}

async function scheduleInDevelopment(schedule: string, port: number) {
  await fetch(
    new URL(`/$schedules/${schedule}`, `http://localhost:${port}`).href,
    { method: "POST" }
  );
}

export default command;

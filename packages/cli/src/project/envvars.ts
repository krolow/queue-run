import { Command } from "commander";
import {
  deleteEnvVariable,
  displayTable,
  getEnvVariables,
  setEnvVariable,
} from "queue-run-builder";
import { loadCredentials } from "./project.js";

const command = new Command("env")
  .description("manage environment variables")
  .addHelpText(
    "after",
    `\n
To download environment variables from the server to use locally:
$ npx queue-run env ls > .env

You can change environment variables when deploying:
$ npx queue-run deploy --environment DEBUG=true

⚠️  You need to re-deploy your project after changing environment variables.
`
  );
command
  .command("list")
  .alias("ls")
  .description("list environment variables")
  .action(async () => {
    const { name, awsRegion: region } = await loadCredentials();
    const envVars = await getEnvVariables({
      environment: "production",
      project: name,
      region,
    });
    display(envVars);
  });

command
  .command("get")
  .description("read the value of an environment variable")
  .arguments("<name>")
  .action(async (varName) => {
    const { name, awsRegion: region } = await loadCredentials();
    const envVars = await getEnvVariables({
      environment: "production",
      project: name,
      region,
    });
    if (envVars.has(varName)) {
      const varValue = envVars.get(varName) ?? "";
      display(new Map([[varName, varValue]]));
    } else console.error('Could not find environment variable "%s"', varName);
  });

command
  .command("set")
  .alias("add")
  .description("add or update an environment variable")
  .arguments("<name> <value>")
  .action(async (varName, varValue) => {
    const { name, awsRegion: region } = await loadCredentials();

    await setEnvVariable({
      environment: "production",
      project: name,
      region,
      varName,
      varValue,
    });
  });

command
  .command("remove")
  .alias("rm")
  .alias("delete")
  .description("delete an environment variable")
  .arguments("<name>")
  .action(async (varName) => {
    const { name, awsRegion: region } = await loadCredentials();
    await deleteEnvVariable({
      environment: "production",
      project: name,
      region,
      varName,
    });
  });

function display(envVars: Map<string, string>) {
  if (process.stdout.isTTY) {
    displayTable(["NAME", "VALUE"], Array.from(envVars.entries()));
  } else {
    for (const [name, value] of Array.from(envVars.entries()))
      console.info("%s=%s", name, value);
  }
}

export default command;

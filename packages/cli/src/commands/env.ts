import { Command } from "commander";
import ora from "ora";
import {
  deleteEnvVariable,
  displayTable,
  getEnvVariables,
  setEnvVariable,
} from "queue-run-builder";
import { loadCredentials } from "../shared/config.js";

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
    const spinner = ora("Loading environment variables").start();
    const envVars = await getEnvVariables({
      environment: "production",
      project: name,
      region,
    });
    spinner.stop();
    display(envVars);
  });

command
  .command("get")
  .description("read the value of an environment variable")
  .arguments("<name>")
  .action(async (varName) => {
    const { name, awsRegion: region } = await loadCredentials();
    const spinner = ora("Loading environment variables").start();
    const envVars = await getEnvVariables({
      environment: "production",
      project: name,
      region,
    });
    spinner.stop();
    if (envVars.has(varName)) {
      const varValue = envVars.get(varName) ?? "";
      display(new Map([[varName, varValue]]));
    } else console.error('Could not find environment variable "%s"', varName);
  });

command
  .command("set")
  .alias("add")
  .description("add or update an environment variable")
  .argument("name", "name of the environment variable")
  .argument("value", "value of the environment variable")
  .addHelpText(
    "after",
    `\n
Either of these will work:

$ npx queue-run env set MY_VAR=my-value
$ npx queue-run env set MY_VAR my-value
`
  )
  .action(async (varName, varValue) => {
    const match = varName.match(/^(.+?)=(.*)$/)?.slice(1);
    if (match) {
      varName = match[0];
      varValue = match[1];
    }
    const { name, awsRegion: region } = await loadCredentials();
    const spinner = ora("Updating environment variables").start();
    await setEnvVariable({
      environment: "production",
      project: name,
      region,
      varName,
      varValue,
    });
    spinner.succeed("Updated environment variable");
  });

command
  .command("remove")
  .alias("rm")
  .alias("delete")
  .description("delete an environment variable")
  .arguments("<name>")
  .action(async (varName) => {
    const { name, awsRegion: region } = await loadCredentials();
    const spinner = ora("Updating environment variables").start();
    await deleteEnvVariable({
      environment: "production",
      project: name,
      region,
      varName,
    });
    spinner.succeed("Updated environment variable");
  });

function display(envVars: Map<string, string>) {
  if (process.stdout.isTTY) {
    displayTable({
      headers: ["NAME", "VALUE"],
      rows: Array.from(envVars.entries()),
      options: { fullWidth: true, wrapCells: true },
    });
    console.info("");
  } else {
    for (const [name, value] of Array.from(envVars.entries()))
      console.info('%s="%s"', name, value.replace(/\n/, "\\n"));
  }
}

export default command;

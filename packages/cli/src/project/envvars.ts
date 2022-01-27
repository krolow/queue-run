import { Command } from "commander";
import {
  deleteEnvVariable,
  getEnvVariables,
  setEnvVariable,
} from "queue-run-builder";
import { loadCredentials } from "./project.js";

const command = new Command("env").description("manage environment variables");

command
  .command("list", { isDefault: true })
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
  .command("add")
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
  .command("delete")
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
    const left = Math.max(
      ...Array.from(envVars.keys()).map((k) => k.length),
      10
    );
    const right = Math.max(
      ...Array.from(envVars.values()).map((k) => k.length),
      30
    );
    console.info("┌─%s─┬─%s─┐", "─".repeat(left), "─".repeat(right));
    console.info("│ %s │ %s │", "NAME".padEnd(left), "VALUE".padEnd(right));
    console.info("├─%s─┼─%s─┤", "─".repeat(left), "─".repeat(right));
    for (const [name, value] of Array.from(envVars.entries()))
      console.info("│ %s │ %s │", name.padEnd(left), value.padEnd(right));
    console.info("└─%s─┴─%s─┘", "─".repeat(left), "─".repeat(right));
  } else {
    for (const [name, value] of Array.from(envVars.entries()))
      console.info("%s=%s", name, value);
  }
}

export default command;

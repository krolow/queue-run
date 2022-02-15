import { Command } from "commander";
import glob from "fast-glob";
import fs from "node:fs/promises";

export default async function () {
  const program = new Command("npx queue-run");
  const { version } = JSON.parse(
    await fs.readFile(
      new URL("../package.json", import.meta.url).pathname,
      "utf-8"
    )
  );
  program.version(version);

  program.showSuggestionAfterError();
  program.addHelpCommand();
  program.showHelpAfterError();

  program.configureHelp({
    sortSubcommands: true,
    sortOptions: true,
  });

  const dirname = new URL("./commands/*.js", import.meta.url).pathname;
  const filenames = await glob(dirname);
  if (filenames.length === 0) throw new Error("No commands found");
  const commands = await Promise.all(
    filenames.map(async (filename) => {
      const { default: command } = await import(filename);
      if (!(command && command instanceof Command))
        throw new Error(`The file ${filename} does not export a command`);
      return command;
    })
  );
  for (const command of commands) program.addCommand(command);
  return program;
}

import { Command } from "commander";
import inquirer from "inquirer";
import { getRecentVersions, updateAlias } from "queue-run-builder";
import { loadProject } from "./project.js";

const command = new Command("rollback")
  .description("roll back to previous version")
  .argument("[version]", "version to roll back to")
  .action(async (version?: string) => {
    const { name } = await loadProject();
    const arn = await chooseVersion(name, version);
    await updateAlias({
      aliasARN: arn.replace(/:\d+$/, ":latest"),
      versionARN: arn,
    });
    console.log({ arn });
  });

async function chooseVersion(slug: string, selected?: string): Promise<string> {
  console.warn(
    "NOTE: Rolling back does not restore queues or update schedules."
  );
  console.warn(
    "If you changed queues or schedules, deploy an older version of the code instead."
  );

  const versions = await getRecentVersions(slug);
  if (selected) {
    const { confirm } = await inquirer.prompt([
      {
        type: "confirm",
        name: "confirm",
        message: `Proceed with rollback to version ${selected}?`,
      },
    ]);
    if (!confirm) throw new Error("Cancelled by user");

    const arn = versions.find(({ version }) => version === selected)?.arn;
    if (!arn) throw new Error(`No version ${selected}`);
    return arn;
  }

  const { version: arn } = await inquirer.prompt([
    {
      type: "list",
      name: "version",
      message: "Which version do you want to roll back to?",
      default: versions.find(({ isCurrent }) => isCurrent)?.arn,
      choices: versions
        .slice(0, 10)
        .map(({ version, arn, isCurrent, modified }) => ({
          name: `${version.padEnd(8)}\t(${modified.toLocaleString()})${
            isCurrent ? " (current)" : ""
          }`,
          value: arn,
        })),
    },
  ]);
  return arn;
}

export default command;

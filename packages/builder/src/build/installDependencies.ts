import chalk from "chalk";
import { spawn } from "child_process";
import { R_OK } from "constants";
import fs from "fs/promises";
import ms from "ms";
import path from "path";

const installFiles = [
  ".npmrc",
  ".yarnrc",
  "package-lock.json",
  "package.json",
  "yarn.lock",
];

// Install dependencies in the target directory using NPM or Yarn.
export default async function installDependencies({
  sourceDir,
  targetDir,
}: {
  sourceDir: string;
  targetDir: string;
}) {
  console.info(chalk.bold.blue("λ: Installing node modules …"));
  await Promise.all(
    installFiles.map(async (filename) =>
      copyFile(filename, sourceDir, targetDir)
    )
  );
  const useYarn = await hasYarnLockFile(targetDir);
  if (useYarn) await yarnInstall(targetDir);
  else await npmInstall(targetDir);
}

async function copyFile(
  filename: string,
  sourceDir: string,
  targetDir: string
) {
  const source = path.resolve(sourceDir, filename);
  const dest = path.resolve(targetDir, filename);
  try {
    await fs.access(source, R_OK);
    await fs.copyFile(source, dest);
  } catch {
    // Source file doesn't exist
  }
}

async function hasYarnLockFile(dirname: string) {
  try {
    await fs.access(path.resolve(dirname, "yarn.lock"), R_OK);
    return true;
  } catch {
    return false;
  }
}

async function yarnInstall(dirname: string) {
  await runCommand({
    dirname,
    command: "yarn install --production --ignore-optional --non-interactive",
  });
}

async function npmInstall(dirname: string) {
  await runCommand({
    dirname,
    command: "npm install --only=production --no-fund --no-optional --no-audit",
  });
}

async function runCommand({
  dirname,
  command,
}: {
  dirname: string;
  command: string;
}) {
  const [executable, ...args] = command.split(" ");
  const install = await spawn(executable, args, {
    cwd: dirname,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      TMPDIR: process.env.TMPDIR,
    },
    stdio: "inherit",
    timeout: ms("30s"),
  });
  await new Promise((resolve, reject) =>
    install
      .on("exit", (code) => {
        if (code === 0) resolve(undefined);
        else reject(new Error(`${executable} exited with code ${code}`));
      })
      .on("error", reject)
  );
}

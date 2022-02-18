import chalk from "chalk";
import glob from "fast-glob";
import { lookpath } from "lookpath";
import ms from "ms";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { debuglog } from "node:util";
import invariant from "tiny-invariant";

const installFiles = [
  ".npmrc",
  ".yarnrc",
  "package-lock.json",
  "package.json",
  "yarn.lock",
];

const debug = debuglog("queue-run:build");

// Install dependencies in the target directory using NPM or Yarn.
export default async function installDependencies({
  sourceDir,
  targetDir,
}: {
  sourceDir: string;
  targetDir: string;
}) {
  console.info(chalk.bold("\nInstalling node modules\n"));
  await Promise.all(
    installFiles.map(async (filename) =>
      copyFile(filename, sourceDir, targetDir)
    )
  );
  const pkgManager = await guessPackageManager(targetDir);
  if (pkgManager === "yarn") await yarnInstall(targetDir);
  else await npmInstall(targetDir);

  await installQueueRun(targetDir);
  await installLambdaRuntime(targetDir);
  console.info("");
}

async function installLambdaRuntime(buildDir: string) {
  const require = createRequire(import.meta.url);
  const runtime = path.join(require.resolve("queue-run-lambda"), "../..");
  debug('Installing runtime from "%s"', runtime);
  const filenames = await glob("dist/*.{mjs,map}", { cwd: runtime });
  await Promise.all(
    filenames.map((filename) =>
      fs.copyFile(
        path.join(runtime, filename),
        path.join(buildDir, path.basename(filename).replace("index", "runtime"))
      )
    )
  );
}

async function installQueueRun(buildDir: string) {
  const require = createRequire(import.meta.url);
  const sourceDir = path.join(require.resolve("queue-run"), "../..");
  const targetDir = path.join(buildDir, "node_modules", "queue-run");
  debug('Installing "%s" => "%s"', sourceDir, targetDir);
  await fs.rm(targetDir, { recursive: true, force: true });
  await fs.mkdir(targetDir, { recursive: true });
  await copyFile("package.json", sourceDir, targetDir);
  const filenames = await glob("dist/**/*", { cwd: sourceDir });
  await Promise.all(
    filenames.map((filename) => copyFile(filename, sourceDir, targetDir))
  );
}

async function copyFile(
  filename: string,
  sourceDir: string,
  targetDir: string
) {
  const source = path.resolve(sourceDir, filename);
  const dest = path.resolve(targetDir, filename);
  try {
    await fs.access(source);
  } catch {
    // Source file doesn't exist
    return;
  }
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(source, dest);
}

async function guessPackageManager(dirname: string): Promise<"npm" | "yarn"> {
  const usingNPM = await fs
    .access(path.resolve(dirname, "package-lock.json"))
    .then(
      () => true,
      () => false
    );
  if (usingNPM) return "npm";

  const hasYarn = await lookpath("yarn");
  if (hasYarn) return "yarn";

  const parent = path.dirname(dirname);
  const isRoot = parent === dirname;
  console.log({ isRoot });
  return isRoot ? "npm" : await guessPackageManager(parent);
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
    command:
      "npm install --only=production --no-fund --no-optional --no-audit --link",
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
  invariant(executable);
  const install = spawn(executable, args, {
    cwd: dirname,
    stdio: "inherit",
    timeout: ms("5m"),
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

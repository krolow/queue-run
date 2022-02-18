import { Command } from "commander";
import glob from "fast-glob";
import inquirer from "inquirer";
import { lookpath } from "lookpath";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { URL } from "node:url";
import ora from "ora";
import { loadProject } from "../shared/config.js";

const command = new Command("init")
  .description("setup a new project")
  .action(async () => {
    const language = await chooseLanguage();
    await copyTemplates(language);
    await updatePackageJSON();
    await loadProject();
  });

export default command;

async function chooseLanguage() {
  const isTypescript = (await glob("**/*.{ts,tsx}")).length > 0;
  const isJavascript = (await glob("**/*.{js,mjs,cjs,jsx}")).length > 0;

  const { language } = await inquirer.prompt([
    {
      default: isTypescript || !isJavascript ? "typescript" : "javascript",
      message: "JavaScript or TypeScript?",
      name: "language",
      type: "list",
      choices: [
        { name: "JavaScript", value: "javascript" },
        { name: "TypeScript", value: "typescript" },
      ],
    },
  ]);
  return language;
}

async function copyTemplates(language: "javascript" | "typescript") {
  await createBaseDirectories();

  const templates = new URL("../../templates", import.meta.url).pathname;

  if (language === "typescript") await prepareForTypeScript(templates);

  const sourceFiles = await glob("{api,queues}/**/*.{mjs,js,jsx,ts,tsx}");
  const isEmpty = sourceFiles.length === 0;
  if (isEmpty) await copySample(path.join(templates, language));
}

async function createBaseDirectories() {
  const spinner = ora("Creating base directories").start();
  const dirs = ["api", "queues", "socket", "schedules"];
  for (const dir of dirs) {
    await fs.mkdir(dir, { recursive: true });
    spinner.succeed(`Created directory: ${dir}`);
  }
}

async function prepareForTypeScript(templates: string) {
  await replaceFile(
    path.join(templates, "typescript", "queue-run.env.d.ts"),
    "queue-run.env.d.ts"
  );
  await replaceFile(
    path.join(templates, "typescript", "tsconfig.json"),
    "tsconfig.json"
  );
}

async function replaceFile(src: string, dest: string) {
  try {
    const spinner = ora(`Updating ${dest}`).start();
    const current = await fs.readFile(dest, "utf-8");
    const template = await fs.readFile(src, "utf-8");
    if (current !== template) await fs.copyFile(src, dest);
    spinner.succeed();
  } catch {
    const spinner = ora(`Adding ${dest}`).start();
    await fs.copyFile(src, dest);
    spinner.succeed();
  }
}

async function copySample(src: string) {
  const spinner = ora(`Copying "hello world" project`).start();
  const filenames = await glob("api/**/*", { cwd: src, dot: true });
  for (const filename of filenames) {
    await fs.mkdir(path.dirname(filename), { recursive: true });
    await fs.copyFile(path.join(src, filename), filename);
  }
  spinner.succeed();
}

async function updatePackageJSON() {
  try {
    // eslint-disable-next-line sonarjs/no-duplicate-string
    await fs.access("package.json");
  } catch {
    const templates = new URL("../../templates", import.meta.url).pathname;
    await fs.copyFile(path.join(templates, "package.json"), "package.json");
  }

  const hasYarn = await lookpath("yarn");
  if (hasYarn) await yarnInstall();
  else await npmInstall(false);
}

async function yarnInstall() {
  const child = spawn("yarn", ["add", "--dev", "queue-run", "queue-run-cli"], {
    stdio: "inherit",
  });
  await new Promise((resolve, reject) =>
    child.on("exit", (code) => (code === 0 ? resolve(undefined) : reject(code)))
  );
}

async function npmInstall(lock: boolean) {
  const child = spawn(
    "npm",
    [
      "install",
      "--save-dev",
      "queue-run",
      "queue-run-cli",
      "--package-lock",
      lock.toString(),
    ],
    {
      stdio: "inherit",
    }
  );
  await new Promise((resolve, reject) =>
    child.on("exit", (code) => (code === 0 ? resolve(undefined) : reject(code)))
  );
}

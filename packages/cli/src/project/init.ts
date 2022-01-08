import { Command } from "commander";
import glob from "fast-glob";
import fs from "fs/promises";
import ora from "ora";
import path from "path";
import { URL } from "url";
import { initProject } from "./project.js";

const command = new Command("init")
  .description("Setup a new project in the current directory")
  .action(async () => {
    const { language } = await initProject();
    await copyTemplates(language);
  });

export default command;

async function copyTemplates(language: "javascript" | "typescript") {
  await createBaseDirectories();

  const templates = new URL("../../templates", import.meta.url).href.replace(
    "file://",
    ""
  );

  if (language === "typescript") await prepareForTypeScript(templates);

  const sourceFiles = await glob("{api,queues}/**/*.{js,jsx,ts,tsx}");
  const isEmpty = sourceFiles.length === 0;
  if (isEmpty) await copySample(path.join(templates, language));
}

async function createBaseDirectories() {
  await fs.mkdir("api", { recursive: true });
  await fs.mkdir("queues", { recursive: true });
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
    const current = await fs.readFile(dest, "utf8");
    const template = await fs.readFile(src, "utf8");
    if (current === template) return;
    const spinner = ora(`Updating ${dest}`).start();
    await fs.copyFile(src, dest);
    spinner.succeed();
  } catch {
    const spinner = ora(`Adding ${dest}`).start();
    await fs.copyFile(src, dest);
    spinner.succeed();
  }
}

async function copySample(src: string) {
  const spinner = ora(`Copying "hello world" project`).start();
  const filenames = await glob("**/*", { cwd: src, dot: true });
  for (const filename of filenames) {
    await fs.mkdir(path.dirname(filename), { recursive: true });
    await fs.copyFile(path.join(src, filename), filename);
  }
  spinner.succeed();
}

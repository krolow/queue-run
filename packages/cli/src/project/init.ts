import { Command } from "commander";
import glob from "fast-glob";
import fs from "node:fs/promises";
import path from "node:path";
import { URL } from "node:url";
import ora from "ora";
import { initProject } from "./project.js";

const command = new Command("init")
  .description("setup a new project")
  .action(async () => {
    const { language } = await initProject();
    await copyTemplates(language);
    await updatePackageJSON();
  });

export default command;

async function copyTemplates(language: "javascript" | "typescript") {
  await createBaseDirectories();

  const templates = new URL("../../templates", import.meta.url).pathname;

  if (language === "typescript") await prepareForTypeScript(templates);

  const sourceFiles = await glob("{api,queues}/**/*.{mjs,js,jsx,ts,tsx}");
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
    const current = await fs.readFile(dest, "utf-8");
    const template = await fs.readFile(src, "utf-8");
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
  const filenames = await glob("api/**/*", { cwd: src, dot: true });
  for (const filename of filenames) {
    await fs.mkdir(path.dirname(filename), { recursive: true });
    await fs.copyFile(path.join(src, filename), filename);
  }
  spinner.succeed();
}

async function updatePackageJSON() {
  const { version } = JSON.parse(
    await fs.readFile(
      new URL("../../package.json", import.meta.url).pathname,
      "utf-8"
    )
  );

  try {
    // eslint-disable-next-line sonarjs/no-duplicate-string
    await fs.access("package.json");
  } catch {
    const templates = new URL("../../templates", import.meta.url).pathname;
    const pkg = JSON.parse(
      await fs.readFile(path.join(templates, "package.json"), "utf-8")
    );
    pkg.peerDependencies["queue-run"] = `^${version}`;
    await fs.writeFile("package.json", JSON.stringify(pkg, null, 2));
  }
}

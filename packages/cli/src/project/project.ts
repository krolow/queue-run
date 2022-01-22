import glob from "fast-glob";
import inquirer from "inquirer";
import fs from "node:fs/promises";
import generate from "project-name-generator";

const filename = ".queue-run.json";

type Project = {
  domain?: string;
  name: string;
  region: string;
  runtime: "lambda";
};

export async function loadProject(): Promise<Project> {
  let source;
  try {
    source = await fs.readFile(filename, "utf-8");
  } catch {
    throw new Error(`Missing ${filename}, please run npx queue-run init`);
  }

  let project;
  try {
    project = JSON.parse(source);
  } catch (error) {
    throw new Error(`Syntax error in ${filename}: ${String(error)}`);
  }

  if (!project.name)
    throw new Error("Missing project name, please run npx queue-run init");
  if (!/^[a-zA-Z0-9-_]+$/.test(project.name))
    throw new Error(
      "Project name must be alphanumeric, dashes and underscores alowed"
    );

  if (!project.runtime)
    throw new Error("Missing project name, please run npx queue-run init");
  if (project.runtime !== "lambda")
    throw new Error(`Unsupported runtime: ${project.runtime}`);

  return project;
}

export async function saveProject({ name, runtime }: Project) {
  const project = { name, runtime };
  await fs.writeFile(filename, JSON.stringify(project, null, 2));
}

export async function initProject() {
  let project;
  try {
    project = await loadProject();
  } catch {
    // No .queue-run.json, we'll create one
    project = {};
  }

  const suggestedName = project.name ?? (await getSuggestedName());

  const isTypescript = (await glob("**/*.{ts,tsx}")).length > 0;
  const isJavascript = (await glob("**/*.{js,mjs,cjs,jsx}")).length > 0;

  const answers = await inquirer.prompt([
    {
      default: suggestedName,
      message: "Project name (alphanumeric + dashes)",
      name: "name",
      type: "input",
      validate: (input: string) =>
        /^[a-zA-Z0-9-]{1,40}$/.test(input)
          ? true
          : "Project name must be 1-40 characters long and can only contain letters, numbers, and dashes",
    },
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
    {
      default: "lambda",
      name: "runtime",
      message: "Which Runtime?",
      type: "list",
      choices: [
        { name: "AWS: Lambda + API Gateway + SQS + DynamoDB", value: "lambda" },
      ],
    },
  ]);
  const { name, runtime } = answers;
  const region = process.env.AWS_REGION ?? "us-east-1";
  await saveProject({ name, region, runtime });
  return answers;
}

async function getSuggestedName() {
  const pkg = await fs.readFile("package.json", "utf-8").catch(() => "{}");
  const { name } = JSON.parse(pkg);
  return name || generate().dashed;
}

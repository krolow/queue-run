import inquirer from "inquirer";
import fs from "node:fs/promises";
import generate from "project-name-generator";

const filename = ".queue-run.json";

type Project = {
  name: string;
  runtime: "lambda";
} & Partial<Credentials>;

type Credentials = {
  awsAccessKeyId: string;
  awsSecretAccessKey: string;
  awsRegion: string;
};

export async function loadProject(): Promise<Project> {
  const project = JSON.parse(
    await fs.readFile(filename, "utf-8").catch(() => "{}")
  );

  const answers = await inquirer.prompt([
    {
      default: async () => project.name ?? (await getSuggestedName()),
      message: "Project name (alphanumeric + dashes)",
      name: "name",
      type: "input",
      when: !project.name,
      validate: (input: string) =>
        /^[a-zA-Z0-9-]{1,40}$/.test(input)
          ? true
          : "Project name must be 1-40 characters long and can only contain letters, numbers, and dashes",
    },
    {
      default: "lambda",
      name: "runtime",
      message: "Which Runtime?",
      type: "list",
      when: !project.runtime,
      choices: [
        { name: "AWS: Lambda + API Gateway + SQS + DynamoDB", value: "lambda" },
      ],
    },
  ]);

  const merged = { ...project, ...answers };
  if (Object.keys(answers).length > 0) await saveProject(merged);
  return merged;
}

export async function loadCredentials(): Promise<Project & Credentials> {
  const project = await loadProject();

  const answers = await inquirer.prompt([
    {
      default: project.awsAccessKeyId,
      message: "AWS Access Key ID",
      name: "awsAccessKeyId",
      type: "input",
      validate: (value) => /^[A-Z0-9]{20}$/.test(value),
      when: !(project.awsAccessKeyId ?? process.env.AWS_ACCESS_KEY_ID),
    },
    {
      default: project.awsSecretAccessKey,
      message: "AWS Secret Access Key",
      name: "awsSecretAccessKey",
      type: "password",
      validate: (value) => /^[a-z0-9=]{30,}$/i.test(value),
      when: !(project.awsSecretAccessKey ?? process.env.AWS_SECRET_ACCESS_KEY),
    },
    {
      default: project.awsRegion ?? "us-east-1",
      message: "AWS Region",
      name: "region",
      type: "text",
      validate: (value) => /^[a-z]{2}-[a-z]+-[0-9]+$/.test(value),
      when: !(project.awsRegion ?? process.env.AWS_REGION),
    },
  ]);

  process.env.AWS_ACCESS_KEY_ID =
    answers.awsAccessKeyId ??
    project.awsAccessKeyId ??
    process.env.AWS_ACCESS_KEY_ID;
  process.env.AWS_SECRET_ACCESS_KEY =
    answers.awsSecretAccessKey ??
    project.awsSecretAccessKey ??
    process.env.AWS_SECRET_ACCESS_KEY;
  process.env.AWS_REGION =
    answers.region ?? project.awsRegion ?? process.env.AWS_REGION;

  const merged = {
    ...project,
    awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    awsRegion: process.env.AWS_REGION!,
  };

  if (Object.keys(answers).length > 0) await saveProject(merged);
  return merged;
}

async function saveProject(project: Project) {
  console.info("Saving %s", filename);
  await fs.writeFile(filename, JSON.stringify(project, null, 2));
}

async function getSuggestedName() {
  const pkg = await fs.readFile("package.json", "utf-8").catch(() => "{}");
  const { name } = JSON.parse(pkg);
  return name || generate().dashed;
}

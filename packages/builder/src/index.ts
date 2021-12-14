import { Command } from "commander";
import dotenv from "dotenv";
import { readFileSync } from "fs";
import path from "path";
import build from "./build";
import installDependencies from "./build/installDependencies";
import upload from "./upload";
import loadEnvVars from "./util/loadEnvVars";

if (!process.env.CREDENTIALS)
  throw new Error("CREDENTIALS environment variable is not set");
const credentials = dotenv.parse(process.env.CREDENTIALS);
process.env.AWS_ACCESS_KEY_ID = credentials.aws_access_key_id;
process.env.AWS_SECRET_ACCESS_KEY = credentials.aws_secret_access_key;
process.env.AWS_REGION = credentials.aws_region;

const program = new Command();
program.version(
  JSON.parse(readFileSync(path.join(__dirname, "..", "package.json"), "utf-8"))
    .version
);

program
  .command("build")
  .description("Build the project")
  .action(async () => {
    const sourceDir = process.cwd();
    await build({ install: false, sourceDir });
  });

program
  .command("upload")
  .description("Upload Lambda functions")
  .argument("<project>", "Project ID")
  .option(
    "-b --branch <branch>",
    "Branch name",
    process.env.GIT_BRANCH ?? "main"
  )
  .option(
    "--region <region>",
    "AWS region",
    process.env.AWS_REGION ?? "us-east-1"
  )
  .action(async (project, { branch, region }) => {
    const sourceDir = process.cwd();
    const envVars = await loadEnvVars();
    await build({ install: false, sourceDir });
    await installDependencies({ sourceDir });
    await upload({ branch, envVars, projectId: project, region });
  });

program.parse(process.argv);

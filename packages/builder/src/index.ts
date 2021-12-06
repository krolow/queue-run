import { Command } from "commander";
import { readFileSync } from "fs";
import path from "path";
import build from "./build";
import upload from "./upload";
import loadEnvVars from "./util/loadEnvVars";

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
    const envVars = await loadEnvVars(sourceDir);
    envVars.NODE_ENV = "production";
    await upload({ branch, envVars, projectId: project, region });
  });

program.parse(process.argv);

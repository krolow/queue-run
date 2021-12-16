import { Command } from "commander";
import dotenv from "dotenv";
import ms from "ms";
import build from "./build";
import upload from "./upload";
import loadEnvVars from "./util/loadEnvVars";

if (!process.env.CREDENTIALS)
  throw new Error("CREDENTIALS environment variable is not set");
const credentials = dotenv.parse(process.env.CREDENTIALS);
process.env.AWS_ACCESS_KEY_ID = credentials.aws_access_key_id;
process.env.AWS_SECRET_ACCESS_KEY = credentials.aws_secret_access_key;
process.env.AWS_REGION = credentials.aws_region;

const program = new Command();

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
    await build({ install: true, sourceDir });
    await upload({ branch, envVars, projectId: project, region });
  });

program
  .parseAsync(process.argv)
  .then(() => {
    if (process.stdout.isTTY)
      console.info("🌟 Done in %s", ms(process.uptime() * 1000));
    return undefined;
  })
  .catch((error) => {
    console.error(String(error));
    process.exit(1);
  });

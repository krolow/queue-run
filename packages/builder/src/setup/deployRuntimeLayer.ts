import { Lambda } from "@aws-sdk/client-lambda";
import chalk from "chalk";
import { spawn } from "child_process";
import glob from "fast-glob";
import filesize from "filesize";
import fs from "fs/promises";
import JSZip from "jszip";
import ora from "ora";
import path from "path";

export const layerName = "qr-runtime";

// Deploy runtime layer to Lambda.  The most recent layer will be used when
// deploying your project.
export default async function deployRuntimeLayer() {
  console.info(chalk.bold.green("Building layer..."));

  const buildDir = ".build";
  await installFiles(buildDir);
  const archive = await createArchive(buildDir);
  await uploadLayer(archive);
}

async function installFiles(buildDir: string) {
  const spinner = ora("Copying runtime...").start();

  await fs.rm(buildDir, { recursive: true, force: true });
  const nodeDir = path.join(buildDir, "nodejs");
  await fs.mkdir(nodeDir, { recursive: true });

  const runtime = path.dirname(require.resolve("@queue-run/runtime"));

  const filenames = await fs.readdir(runtime);
  for (const filename of filenames)
    await fs.copyFile(
      path.join(runtime, filename),
      path.join(nodeDir, filename)
    );
  await fs.copyFile(
    path.join(runtime, "../package.json"),
    path.join(nodeDir, "package.json")
  );
  spinner.succeed("Runtime copied");

  const install = spawn("npm", ["install", "--only=production"], {
    cwd: nodeDir,
    stdio: "inherit",
  });
  await new Promise((resolve, reject) =>
    install
      .on("exit", (code) => {
        if (code === 0) resolve(undefined);
        else reject(new Error(`npm exited with code ${code}`));
      })
      .on("error", reject)
  );
}

async function createArchive(buildDir: string): Promise<Buffer> {
  const spinner = ora("Creating archive...").start();
  const zip = new JSZip();
  const filenames = glob.sync("**/*", {
    cwd: buildDir,
  });
  await Promise.all(
    filenames.map(async (filename) => {
      const filepath = path.join(buildDir, filename);
      const content = await fs.readFile(filepath);
      zip.file(filename, content);
    })
  );
  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  await fs.writeFile(path.join(buildDir, "layer.zip"), buffer);
  spinner.succeed(`Archive created (${filesize(buffer.byteLength)})`);
  return buffer;
}

async function uploadLayer(archive: Buffer) {
  const spinner = ora("Publishing layer...").start();
  try {
    const lambda = new Lambda({});
    const { LayerVersionArn: versionARN } = await lambda.publishLayerVersion({
      LayerName: layerName,
      Description: "Runtime layer for QueueRun (Node)",
      CompatibleRuntimes: ["nodejs12.x", "nodejs14.x"],
      Content: { ZipFile: archive },
    });
    spinner.succeed(`Layer published (${versionARN})`);
  } catch (error) {
    spinner.fail(String(error));
    throw error;
  }
}

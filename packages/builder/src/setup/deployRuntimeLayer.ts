import { Lambda } from "@aws-sdk/client-lambda";
import chalk from "chalk";
import { exec } from "child_process";
import glob from "fast-glob";
import filesize from "filesize";
import fs from "fs/promises";
import JSZip from "jszip";
import ora from "ora";
import path from "path";
import invariant from "tiny-invariant";
import { promisify } from "util";

export const layerName = "qr-runtime";

// Deploy runtime layer to Lambda.  The most recent layer will be used when
// deploying your project.
export default async function deployRuntimeLayer() {
  console.info(
    chalk.bold.green(`Building Lambda runtime layer (${layerName}) ...`)
  );

  const buildDir = ".build";
  await copyFiles(buildDir);
  await installDependencies(buildDir);
  const archive = await createArchive(buildDir);
  const version = await uploadLayer(archive);
  await deletingOldLayers(version);
}

async function copyFiles(buildDir: string) {
  const spinner = ora("Copying runtime ...").start();

  await fs.rm(buildDir, { recursive: true, force: true });
  const nodeDir = path.join(buildDir, "nodejs");
  await fs.mkdir(nodeDir, { recursive: true });

  const runtime = path.dirname(require.resolve("queue-run-lambda"));

  const filenames = await glob("**/*", { cwd: runtime });
  for (const filename of filenames) {
    await fs.mkdir(path.dirname(path.join(nodeDir, filename)), {
      recursive: true,
    });
    await fs.copyFile(
      path.join(runtime, filename),
      path.join(nodeDir, filename)
    );
  }
  spinner.succeed("Copied runtime");
}

async function installDependencies(buildDir: string) {
  const spinner = ora("Installing dependencies ...").start();

  const runtime = path.dirname(require.resolve("queue-run-lambda"));
  await fs.copyFile(
    path.join(runtime, "../package.json"),
    path.join(buildDir, "package.json")
  );

  try {
    await promisify(exec)("npm install --only=production", {
      cwd: path.join(buildDir),
    });
    await fs.rename(
      path.join(buildDir, "node_modules"),
      path.join(buildDir, "nodejs/node_modules")
    );
  } catch (error) {
    spinner.fail();
    const { stdout } = error as { stdout: string; stderr: string };
    process.stdout.write(stdout);
    throw error;
  }
  spinner.succeed("Installed dependencies");
}

async function createArchive(buildDir: string): Promise<Buffer> {
  const spinner = ora("Creating archive ...").start();
  const zip = new JSZip();
  const filenames = glob.sync("**/*", {
    ignore: ["package.json", "package-lock.json"],
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
  await fs.writeFile(path.join(buildDir, "runtime.zip"), buffer);
  spinner.succeed(`Created archive (${filesize(buffer.byteLength)})`);
  return buffer;
}

async function uploadLayer(archive: Buffer): Promise<number> {
  const spinner = ora("Publishing layer ...").start();
  try {
    const lambda = new Lambda({});
    const { LayerVersionArn: versionARN, Version: version } =
      await lambda.publishLayerVersion({
        LayerName: layerName,
        Description: "Runtime layer for QueueRun (Node)",
        CompatibleRuntimes: ["nodejs12.x", "nodejs14.x"],
        Content: { ZipFile: archive },
      });
    spinner.succeed(`Published layer: ${versionARN}`);
    invariant(version);
    return version;
  } catch (error) {
    spinner.fail(String(error));
    throw error;
  }
}

async function deletingOldLayers(lastVersion: number) {
  const spinner = ora("Deleting old layers ...").start();
  try {
    const lambda = new Lambda({});
    const { LayerVersions: versions } = await lambda.listLayerVersions({
      LayerName: layerName,
    });
    invariant(versions);
    const oldVersions = versions.filter(
      ({ Version }) => !Version || Version < lastVersion
    );
    await Promise.all(
      oldVersions.map(async ({ Version }) =>
        lambda.deleteLayerVersion({
          LayerName: layerName,
          VersionNumber: Version,
        })
      )
    );
    spinner.succeed("Deleted old layers");
  } catch (error) {
    spinner.fail(String(error));
  }
}

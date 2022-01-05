import { Lambda } from "@aws-sdk/client-lambda";
import chalk from "chalk";
import { spawn } from "child_process";
import glob from "fast-glob";
import filesize from "filesize";
import fs from "fs/promises";
import JSZip from "jszip";
import ora from "ora";
import path from "path";
import invariant from "tiny-invariant";
import { debuglog } from "util";

export const layerName = "qr-runtime";

const debug = debuglog("queue-run");

// Deploy runtime layer to Lambda.  The most recent layer will be used when
// deploying your project.
export default async function deployRuntimeLayer(force = false) {
  if ((await hasRecentLayer()) && !force) return;
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

function getRuntimePath() {
  return path.dirname(require.resolve("queue-run-lambda"));
}

async function hasRecentLayer(): Promise<boolean> {
  // eslint-disable-next-line sonarjs/no-duplicate-string
  const stat = await fs.stat(path.join(getRuntimePath(), "..", "package.json"));
  const lambda = new Lambda({});
  const { LayerVersions: versions } = await lambda.listLayerVersions({
    LayerName: layerName,
  });
  const latest = versions?.[0];
  if (!latest) {
    debug('No recent layer found "%s"', layerName);
    return false;
  }

  const createdAt = latest.CreatedDate;
  invariant(createdAt);

  debug(
    "Latest layer created at %s, runtime package.json dated %s",
    createdAt,
    stat.ctime
  );
  return Date.parse(createdAt!) > stat.ctime.getTime();
}

async function copyFiles(buildDir: string) {
  const spinner = ora("Copying runtime ...").start();

  debug('Clearing out and creating "%s"', buildDir);
  await fs.rm(buildDir, { recursive: true, force: true });
  const nodeDir = path.join(buildDir, "nodejs");
  await fs.mkdir(nodeDir, { recursive: true });

  const runtimePath = getRuntimePath();
  debug('Runtime found at "%s"', runtimePath);

  const filenames = await glob("**/*", { cwd: runtimePath });
  for (const filename of filenames) {
    debug('Copying "%s"', filename);
    await fs.mkdir(path.dirname(path.join(nodeDir, filename)), {
      recursive: true,
    });
    await fs.copyFile(
      path.join(runtimePath, filename),
      path.join(nodeDir, filename)
    );
  }
  spinner.succeed("Copied runtime");
}

async function installDependencies(buildDir: string) {
  const spinner = ora("Installing dependencies ...").start();

  const runtimePath = getRuntimePath();
  debug("Copying package.json");
  await fs.copyFile(
    path.join(runtimePath, "../package.json"),
    path.join(buildDir, "package.json")
  );

  const install = spawn("npm", ["install", "--production"], {
    cwd: path.join(buildDir),
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

  debug("Moving node_modules under nodejs");
  await fs.rename(
    path.join(buildDir, "node_modules"),
    path.join(buildDir, "nodejs/node_modules")
  );
  spinner.succeed("Installed dependencies");
}

async function createArchive(buildDir: string): Promise<Buffer> {
  const spinner = ora("Creating archive ...").start();
  const zip = new JSZip();
  const filenames = glob.sync("**/*", {
    ignore: ["package.json", "package-lock.json"],
    cwd: buildDir,
  });

  debug("Archiving %d files", filenames.length);
  await Promise.all(
    filenames.map(async (filename) => {
      const filepath = path.join(buildDir, filename);
      const content = await fs.readFile(filepath);
      zip.file(filename, content);
    })
  );

  const buffer = await zip.generateAsync({
    type: "nodebuffer",
    compressionOptions: { level: 9 },
  });
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
        Description: "Runtime layer for QueueRun",
        CompatibleRuntimes: ["nodejs12.x", "nodejs14.x"],
        Content: { ZipFile: archive },
      });
    spinner.succeed(`Published layer: ${versionARN}`);

    invariant(version);
    debug("Layer version %s", version);
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
      oldVersions.map(async ({ Version }) => {
        debug("Deleting version %s", Version);
        await lambda.deleteLayerVersion({
          LayerName: layerName,
          VersionNumber: Version,
        });
      })
    );
    spinner.succeed("Deleted old layers");
  } catch (error) {
    spinner.fail(String(error));
  }
}

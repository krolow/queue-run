import { Lambda } from "@aws-sdk/client-lambda";
import chalk from "chalk";
import { execFile } from "child_process";
import glob from "fast-glob";
import filesize from "filesize";
import fs from "fs/promises";
import JSZip from "jszip";
import { createRequire } from "module";
import ora from "ora";
import path from "path";
import invariant from "tiny-invariant";
import { debuglog, promisify } from "util";

export const layerName = "qr-runtime";

const debug = debuglog("queue-run:deploy");

// Deploy runtime layer to Lambda.  The most recent layer will be used when
// deploying your project.
export default async function deployRuntimeLayer(force = false) {
  const require = createRequire(import.meta.url);
  const runtimePath = path.join(require.resolve("queue-run-lambda"), "../..");

  if ((await hasRecentLayer(runtimePath)) && !force) return;
  console.info(
    chalk.bold.green(`Building Lambda runtime layer (${layerName}) ...`)
  );

  const buildDir = ".queue-run";
  await installRuntime(buildDir, runtimePath);
  const archive = await createArchive(buildDir);
  const version = await uploadLayer(archive);
  await deletingOldLayers(version);
}

async function hasRecentLayer(runtimePath: string): Promise<boolean> {
  // eslint-disable-next-line sonarjs/no-duplicate-string
  const stat = await fs.stat(path.join(runtimePath, "package.json"));
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

async function installRuntime(buildDir: string, runtimePath: string) {
  const spinner = ora("Installing dependencies ...").start();

  debug('Clearing out and creating "%s"', buildDir);
  await fs.rm(buildDir, { recursive: true, force: true });

  const dest = path.join(buildDir, "nodejs");
  await fs.mkdir(dest, { recursive: true });

  const { version } = JSON.parse(
    await fs.readFile(path.join(runtimePath, "package.json"), "utf8")
  );
  const pkg = { dependencies: { "queue-run-lambda": version } };
  await fs.writeFile(path.join(dest, "package.json"), JSON.stringify(pkg));
  await promisify(execFile)(
    "npm",
    ["install", "--no-package-lock", "--only=production"],
    { cwd: dest }
  );
  spinner.succeed("Installed dependencies");
}

async function createArchive(buildDir: string): Promise<Buffer> {
  const spinner = ora("Creating archive ...").start();
  const zip = new JSZip();
  const filenames = await glob("**/*", { cwd: buildDir });

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
        CompatibleRuntimes: ["nodejs14.x"],
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

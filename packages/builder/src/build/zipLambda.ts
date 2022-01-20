import glob from "fast-glob";
import filesize from "filesize";
import JSZip from "jszip";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import ora from "ora";

export default async function zipLambda(dirname: string): Promise<Uint8Array> {
  const spinner = ora(`Creating zip archive for ${dirname} …`).start();

  const filenames = await glob("**/*", {
    cwd: dirname,
    dot: true,
    followSymbolicLinks: true,
    onlyFiles: true,
  });

  const zip = new JSZip();
  await Promise.all(
    filenames.map(async (filename) => {
      const filepath = path.resolve(dirname, filename);
      const stat = await lstat(filepath);
      if (!(stat.isDirectory() || stat.isSymbolicLink()))
        zip.file(filename, await readFile(filepath));
    })
  );

  const buffer = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
  });

  spinner.stop();
  console.info("λ: Zipped %s", filesize(buffer.byteLength));
  await displaySummary(zip);
  return buffer;
}

async function displaySummary(zip: JSZip) {
  const folders = new Map<string, number>();
  await Promise.all(
    Object.values(zip.files).map(async (entry) => {
      if (entry.dir) return;
      const folder = summaryFolderName(entry.name);
      const { byteLength } = await entry.async("uint8array");
      folders.set(folder, (folders.get(folder) ?? 0) + byteLength);
    })
  );
  const lines = Array.from(folders.entries())
    .sort()
    .map(([dirname, byteLength]) =>
      [truncated(dirname), filesize(byteLength)].join("\t")
    );
  console.info("%s", lines.map((line) => `   ${line}`).join("\n"));
}

function summaryFolderName(filename: string): string {
  const dirname = path.dirname(filename);
  if (dirname === ".") return "/";
  return dirname.replace(/((^|\/)node_modules)(\/|$).*/, "$1");
}

function truncated(dirname: string) {
  if (dirname.length < 40) return dirname.padEnd(40);
  if (dirname.length > 40)
    return dirname.replace(/^(.{19}).*(.{20})$/, "$1…$2");
  return dirname;
}

import chalk from "chalk";
import glob from "fast-glob";
import filesize from "filesize";
import { lstat, readFile } from "fs/promises";
import JSZip from "jszip";
import ora from "ora";
import path from "path";

export default async function createZip(dirname: string): Promise<Uint8Array> {
  const spinner = ora(`Creating zip archive for ${dirname} …`).start();

  const filenames = glob.sync("**/*", {
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
    compressionOptions: { level: 9 },
  });

  spinner.stop();
  console.info(chalk.bold.blue("λ: Zipped %s"), filesize(buffer.byteLength));

  const folders = new Map<string, number>();
  await Promise.all(
    Object.values(zip.files).map(async (entry) => {
      const dirname = path.dirname(entry.name);
      const folder = summaryFolderName(dirname);
      const { byteLength } = await entry.async("uint8array");
      folders.set(folder, (folders.get(folder) ?? 0) + byteLength);
    })
  );
  for (const [dirname, size] of folders) {
    if (size > 0)
      console.info("   %s   %s", truncated(dirname), filesize(size));
  }

  return buffer;
}

function summaryFolderName(dirname: string): string {
  if (dirname === ".") return "/";
  if (dirname.startsWith("node_modules/")) {
    const parts = dirname.split("/");
    return parts.slice(0, parts[1]?.startsWith("@") ? 3 : 2).join("/");
  } else return dirname;
}

function truncated(dirname: string) {
  if (dirname.length < 40) return dirname.padEnd(40);
  if (dirname.length > 40)
    return dirname.replace(/^(.{19}).*(.{20})$/, "$1…$2");
  return dirname;
}

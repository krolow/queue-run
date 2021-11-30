import filesize from "filesize";
import { lstatSync } from "fs";
import { readFile } from "fs/promises";
import glob from "glob";
import JSZip from "jszip";
import path from "path";

export default async function createZip(dirname: string): Promise<Uint8Array> {
  const zip = new JSZip();
  const filenames = glob.sync(`${dirname}/**/*`);
  for (const filename of filenames) {
    if (
      lstatSync(filename).isDirectory() ||
      lstatSync(filename).isSymbolicLink()
    )
      continue;
    const buffer = await readFile(filename);
    zip.file(path.relative(dirname, filename), buffer, {
      compression: "DEFLATE",
    });
  }

  const buffer = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  });
  console.info("λ: Zipped %s", filesize(buffer.byteLength));

  const folders = new Map<string, number>();
  for (const file of Object.values(zip.files)) {
    const dirname = path.dirname(file.name);
    const folder = summaryFolderName(dirname);
    const { byteLength } = await file.async("uint8array");
    folders.set(folder, (folders.get(folder) ?? 0) + byteLength);
  }
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

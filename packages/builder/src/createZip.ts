import filesize from "filesize";
import { lstat, readFile } from "fs/promises";
import glob from "glob";
import JSZip from "jszip";
import ms from "ms";
import path from "path";

export default async function createZip(dirname: string): Promise<Uint8Array> {
  const start = Date.now();
  console.info("λ: Zipping %s", dirname);

  const zip = new JSZip();
  const filenames = glob.sync("**/*", {
    cwd: dirname,
    dot: true,
    follow: true,
  });
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
  console.info("λ: Zipped %s", filesize(buffer.byteLength));

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

  console.info("✨  Done in %s.", ms(Date.now() - start));
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

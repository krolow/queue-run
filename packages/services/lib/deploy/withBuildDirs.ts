import fs from "fs/promises";
import JSZip from "jszip";
import path from "path";

// Explode the zip into a temporary directory (sourceDir), create a second
// temporary directory (targetDir), and run the build function.
//
// Temporary directories are destroyed when this build function completes.
//
// Note that Lambda gives us about 512MB of storage in /tmp: an archive can
// eat up a lot more than that.
export default async function withBuildDirs<T>(
  { archive, signal }: { archive: Buffer; signal: AbortSignal },
  buildFn: ({
    sourceDir,
    targetDir,
  }: {
    sourceDir: string;
    targetDir: string;
  }) => Promise<T>
): Promise<T> {
  const sourceDir = await fs.mkdtemp("/tmp/source");
  const targetDir = await fs.mkdtemp("/tmp/target");
  try {
    await explodeZip(archive, sourceDir);
    if (signal.aborted) throw new Error();

    return await buildFn({ sourceDir, targetDir });
  } finally {
    await Promise.all([
      fs.rm(sourceDir, { force: true, recursive: true }),
      fs.rm(targetDir, { force: true, recursive: true }),
    ]);
  }
}

async function explodeZip(archive: Buffer, targetDir: string) {
  const zip = new JSZip();
  await zip.loadAsync(archive);
  await Promise.all(
    Object.entries(zip.files).map(async ([filename, file]) => {
      const realpath = path.resolve(targetDir, filename);
      if (file.dir) await fs.mkdir(realpath, { recursive: true });
      else {
        await fs.mkdir(path.dirname(realpath), { recursive: true });
        await fs.writeFile(realpath, await file.async("nodebuffer"));
      }
    })
  );
}

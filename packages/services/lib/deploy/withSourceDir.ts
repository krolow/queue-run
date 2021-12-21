import fs from "fs/promises";
import JSZip from "jszip";
import path from "path";

// Explode the zip into a temporary directory (sourceDir), and run the build
// function.
//
// Note that Lambda gives us about 512MB of storage in /tmp, and we need space
// for both the source and the build. Since Lambda is limited to 250MB we should
// have enough space to build the project. Important that we delete all tmp files
// when we're done.
export default async function withBuildDirs<T>(
  { archive, signal }: { archive: Buffer; signal: AbortSignal },
  buildFn: (sourceDir: string) => Promise<T>
): Promise<T> {
  const sourceDir = await fs.mkdtemp("/tmp/source");
  try {
    await explodeZip(archive, sourceDir);
    if (signal.aborted) throw new Error();

    return await buildFn(sourceDir);
  } finally {
    await fs.rm(sourceDir, { force: true, recursive: true });
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

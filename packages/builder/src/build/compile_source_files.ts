import * as swc from "@swc/core";
import glob from "fast-glob";
import fs from "node:fs/promises";
import path from "node:path";
import { debuglog } from "node:util";
import ora from "ora";
import getRuntimeVersion from "./get_runtime.js";

const debug = debuglog("queue-run:compile");

export default async function compileSourceFiles({
  sourceDir,
  targetDir,
}: {
  sourceDir: string;
  targetDir: string;
}) {
  const spinner = ora("Compiling source files").start();
  try {
    const ignore = (
      await fs
        .readFile(path.join(sourceDir, ".gitignore"), "utf-8")
        .catch(() => "")
    )
      .split("\n")
      .filter((line) => line.trim().length > 0 && !line.startsWith("#"));

    const filenames = await glob("**/*", {
      cwd: sourceDir,
      onlyFiles: true,
      followSymbolicLinks: true,
      ignore: [...ignore, "**/node_modules/**", targetDir, "*.d.ts"],
      markDirectories: true,
      unique: true,
    });

    const { jscTarget } = await getRuntimeVersion(sourceDir);
    const esm = await getIsModule(sourceDir);
    const extension = esm ? ".js" : ".mjs";

    let compiled = 0;
    let copied = 0;
    for (const filename of filenames) {
      const src = path.join(sourceDir, filename);
      const dest = path
        .join(targetDir, filename)
        .replace(/\.(js|ts)x?$/, extension);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      if (/\.(js|ts)x?$/.test(filename)) {
        const source = await fs.readFile(src, "utf-8");
        const { code, map } = compileSource({
          filename,
          jscTarget,
          source,
        });
        await fs.writeFile(dest, code, "utf-8");
        if (map) await fs.writeFile(dest + ".map", map, "utf-8");
        compiled++;
      } else {
        await fs.copyFile(src, dest);
        copied++;
      }
    }

    spinner.succeed(`Compiled ${compiled} files and copied ${copied} files`);
  } catch (error) {
    spinner.fail(String(error));
    throw error;
  }
}

async function getIsModule(dirname: string) {
  const filename = path.join(dirname, "package.json");
  const { type } = JSON.parse(
    await fs.readFile(filename, "utf-8").catch(() => "{}")
  );
  return type === "module";
}

function compileSource({
  filename,
  jscTarget,
  source,
}: {
  filename: string;
  jscTarget: swc.JscTarget;
  source: string;
}): { code: string; map?: string } {
  const syntax = /\.tsx?$/.test(filename) ? "typescript" : "ecmascript";
  debug('Compiling "%s" (%s)', filename, syntax);

  return swc.transformSync(source, {
    filename,
    isModule: true,
    jsc: {
      parser: {
        decorators: true,
        dynamicImport: true,
        syntax,
      },
      target: jscTarget,
      transform: {
        constModules: {
          globals: {
            typeofs: {
              window: "undefined",
            },
          },
        },
        react: {
          importSource: "queue-run",
          runtime: "automatic",
          throwIfNamespace: false,
        },
      },
    },
    module: { type: "es6" },
    sourceMaps: true,
    swcrc: false,
  });
}

import * as swc from "@swc/core";
import chalk from "chalk";
import glob from "fast-glob";
import fs from "fs/promises";
import ora from "ora";
import path from "path";
import { debuglog } from "util";
import getRuntimeVersion from "./getRuntime";

const debug = debuglog("queue-run:compile");

export default async function compileSourceFiles({
  sourceDir,
  targetDir,
}: {
  sourceDir: string;
  targetDir: string;
}) {
  const spinner = ora("Compiling source files …").start();

  const { jscTarget } = await getRuntimeVersion(sourceDir);

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
    ignore: [...ignore, "**/node_modules/**", "index.js", targetDir, "*.d.ts"],
    markDirectories: true,
    unique: true,
  });
  let compiled = 0;
  let copied = 0;
  for (const filename of filenames) {
    const src = path.join(sourceDir, filename);
    const dest = path.join(targetDir, filename).replace(/\.tsx?$/, ".js");
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
  spinner.stop();
  console.info(
    chalk.bold.blue("λ: Compiled %d files and copied %d files"),
    compiled,
    copied
  );
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

  const rootDir = path.relative(filename, ".").replace("../", "");
  return swc.transformSync(source, {
    filename,
    isModule: true,
    jsc: {
      paths: { "~/*": [path.join(rootDir, "*")] },
      parser: { syntax },
      target: jscTarget,
      transform: {
        optimizer: {
          globals: {
            vars: {
              __QR: 'require("queue-run")',
            },
          },
        },
        react: {
          pragma: "__QR.JSXXML",
          pragmaFrag: "__QR.Fragment",
          runtime: "classic",
          throwIfNamespace: false,
        },
      },
    },
    module: { type: "commonjs" },
    sourceMaps: true,
    swcrc: false,
  });
}

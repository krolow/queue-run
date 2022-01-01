import swc from "@swc/core";
import chalk from "chalk";
import glob from "fast-glob";
import fs from "fs/promises";
import ora from "ora";
import path from "path";
import getRuntimeVersion from "./getRuntime";

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

  const filenames = glob.sync("**/*", {
    cwd: sourceDir,
    followSymbolicLinks: true,
    ignore: [...ignore, "**/node_modules/**", "index.js", targetDir],
    markDirectories: true,
    unique: true,
  });
  let compiled = 0;
  let copied = 0;
  for (const filename of filenames) {
    const dest = path.join(targetDir, path.relative(sourceDir, filename));
    if (filename.endsWith("/")) {
      await fs.mkdir(dest, { recursive: true });
    } else {
      await fs.mkdir(path.dirname(dest), { recursive: true });
      if (/\.(js|ts)x?$/.test(filename)) {
        await compileSourceFile({ filename, dest, jscTarget });
        compiled++;
      } else {
        await fs.copyFile(filename, dest);
        copied++;
      }
    }
  }
  spinner.stop();
  console.info(
    chalk.bold.blue("λ: Compiled %d files and copied %d files"),
    compiled,
    copied
  );
}

// We compile TypeScript to JavaScript, but also compile latest ECMAScript to
// whatever version is supported by the runtime.
async function compileSourceFile({
  dest,
  filename,
  jscTarget,
}: {
  dest: string;
  filename: string;
  jscTarget: swc.JscTarget;
}) {
  const source = await fs.readFile(filename, "utf-8");
  const { code, map } = compileSource({ filename, jscTarget, source });
  await fs.writeFile(dest.replace(/\.tsx?$/, ".js"), code, "utf-8");
  if (map)
    await fs.writeFile(dest.replace(/\.(js|ts)x?$/, ".js.map"), map, "utf-8");
}

export function compileSource({
  filename,
  jscTarget,
  source,
}: {
  filename: string;
  jscTarget: swc.JscTarget;
  source: string;
}) {
  const syntax = /\.tsx?$/.test(filename) ? "typescript" : "ecmascript";
  return swc.transformSync(source, {
    filename,
    isModule: true,
    jsc: {
      paths: { "~/*": [path.join(process.cwd(), "*")] },
      parser: { syntax },
      target: jscTarget,
      transform: {
        optimizer: {
          globals: {
            vars: {
              __JSX: 'require("jsx-xml")',
            },
          },
        },
        react: {
          pragma: "__JSX.JSXXML",
          pragmaFrag: "__JSX.Fragment",
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

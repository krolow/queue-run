import * as swc from "@swc/core";
import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { register } from "ts-node";
import * as vm from "vm";

register();

async function configureQueues() {
  const filenames = await listFilenames("queue");
  for (const filename of filenames) {
    console.log("Loading %s", filename);
    const exports = await loadScript(filename);
    const fn = exports.default;
    if (typeof fn !== "function")
      throw new Error(`Expected ${filename} to export a default function`);
  }
}

async function listFilenames(type: string) {
  const dirname = join("background", type);
  const filenames = await readdir(dirname);
  return filenames
    .filter((filename) => filename.endsWith(".ts") || filename.endsWith(".js"))
    .map((filename) => join(dirname, filename));
}

async function loadScript(filename: string) {
  const source = await readScript(filename);
  const script = new vm.Script(source, { filename });
  const context = vm.createContext({ exports: {} });
  script.runInContext(context);
  return context.exports;
}

async function readScript(filename: string) {
  const source = await readFile(filename, "utf8");
  if (filename.endsWith(".js")) return source;
  const { code } = await swc.transform(source, {
    filename,
    sourceMaps: true,
    module: { type: "commonjs" },
  });
  return code;
}

async function setup() {
  try {
    await configureQueues();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

setup();

import { spawn } from "child_process";
import { copyFile } from "fs/promises";
import ms from "ms";
import path from "path";

export default async function installDependencies({
  sourceDir,
  targetDir,
}: {
  sourceDir: string;
  targetDir: string;
}) {
  await copyPackageJSON(sourceDir, targetDir);
  await yarn({ dirname: targetDir, args: ["install", "--production"] });
  await yarn({ dirname: targetDir, args: ["link", "@queue-run/runtime"] });
  console.info();
}

async function copyPackageJSON(sourceDir: string, targetDir: string) {
  const source = path.resolve(sourceDir, "package.json");
  const dest = path.resolve(targetDir, "package.json");
  await copyFile(source, dest);
}

async function yarn({ dirname, args }: { dirname: string; args: string[] }) {
  const install = await spawn("yarn", args, {
    cwd: dirname,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      TMPDIR: process.env.TMPDIR,
    },
    stdio: "inherit",
    timeout: ms("30s"),
  });
  await new Promise((resolve, reject) => {
    install.on("error", reject);
    install.on("exit", resolve);
  });
}

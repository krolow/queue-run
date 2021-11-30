import { spawn } from "child_process";
import { copyFile } from "fs/promises";
import ms from "ms";
import path from "path";

export default async function installDependencies(dirname: string) {
  await yarn({ dirname, args: ["install", "--production"] });
  await yarn({ dirname, args: ["link", "@assaf/untitled-runtime"] });
  await copyFile(
    path.resolve(__dirname, "../handlers/handler.js"),
    path.resolve(dirname, "index.js")
  );
  process.stdout.write("\n");
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

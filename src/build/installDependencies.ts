import { spawn } from "child_process";
import ms from "ms";

export default async function installDependencies(dirname: string) {
  const install = await spawn("yarn", ["install", "--production"], {
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
  process.stdout.write("\n");
}

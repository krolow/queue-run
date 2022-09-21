import { Sema } from "async-sema";
import chalk from "chalk";
import * as chokidar from "chokidar";
import cluster from "node:cluster";
import path from "node:path";
import process from "node:process";
import invariant from "tiny-invariant";

// Make sure we're not building the project in parallel.
const blockOnBuild = new Sema(1);

const sourceDir = process.cwd();
const buildDir = path.resolve(".queue-run");

export default async function primary(port: number) {
  console.info(
    chalk.bold.green("👋 Dev server listening on:\n   %s\n   %s"),
    `http://localhost:${port}`,
    `ws://localhost:${port}`
  );
  watchForChanges();
  keyboardShortcuts();
  await newWorker();
  await waitForever();
}

function watchForChanges() {
  console.info(chalk.gray("   Watching for changes (Crtl+R to reload) …"));
  chokidar
    .watch(sourceDir, {
      ignored: ["**/node_modules/**", buildDir, "**/.*/**", "**/*.test.ts"],
      ignoreInitial: true,
    })
    .on("all", (event, filename) => onFileChange({ event, filename }));
}

function keyboardShortcuts() {
  process.stdin.on("data", (data) => {
    const key = data[0]!;
    switch (key) {
      case 3: {
        // Ctrl+C
        process.exit(0);
        break;
      }
      case 12: {
        // Ctrl+L
        // ANSI code to clear terminal
        process.stdout.write("\u001B[2J\u001B[0;0f");
        break;
      }
      case 18: {
        // Ctrl+R
        restart();
        break;
      }
      case 13: {
        // Enter
        process.stdout.write("\n");
        break;
      }
      default: {
        if (key < 32)
          console.info(
            "   %s",
            chalk.gray(
              [
                "Ctrl+C to exit",
                "Ctrl+L to clear screen",
                "Ctrl+R to reload",
              ].join(", ")
            )
          );
        process.stdout.write(String.fromCharCode(key));
      }
    }
  });
}

async function waitForever() {
  await new Promise(() => {});
}

async function newWorker() {
  const token = await blockOnBuild.acquire();
  const worker = cluster.fork();
  // For some reason we need to reset this every time we fork
  process.stdin.setRawMode(true);
  process.stdin.resume();

  await new Promise((resolve) => {
    worker
      .on("message", (message) => {
        if (message === "ready") resolve(undefined);
      })
      .on("exit", () => resolve(undefined));
  });
  blockOnBuild.release(token);

  if (worker.isDead()) {
    setTimeout(() => newWorker(), 1000);
  } else worker.on("exit", () => newWorker());
}

function restart() {
  for (const worker of Object.values(cluster.workers!)) {
    invariant(worker);
    worker.disconnect();
    const timeout = setTimeout(() => worker.kill(), 1000);
    worker.on("disconnect", () => clearTimeout(timeout));
  }
}

function onFileChange({
  event,
  filename,
}: {
  event: string;
  filename: string;
}) {
  if (!(event === "add" || event === "change")) return;
  if (!/\.(tsx?|jsx?|json)$/.test(filename)) return;

  console.info(
    chalk.gray(`   %s "%s" reloading`),
    event === "add" ? "New file" : "Changed",
    filename
  );
  restart();
}

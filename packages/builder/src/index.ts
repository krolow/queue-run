export * from "./build/index.js";
export * from "./deploy/index.js";
export * from "./setup/index.js";

import fs from "node:fs/promises";
export const policy = JSON.parse(
  await fs.readFile(new URL("./policy.json", import.meta.url).pathname, "utf-8")
);

import { createRequire } from "module";
export * from "./build/index.js";
export * from "./deploy/index.js";
export * from "./setup/index.js";

export const policy = createRequire(import.meta.url)("./policy.json");

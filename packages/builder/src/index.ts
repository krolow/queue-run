import { createRequire } from "module";
export * from "./build/index.js";
export * from "./deploy/index.js";
export * from "./setup/index.js";

// This is bullshit, but Node 14 has no way to import JSON as module, and tsc
// doesn't see the import so won't copy the file to the dist directory.
export const policy = createRequire(import.meta.url)("../src/policy.json");

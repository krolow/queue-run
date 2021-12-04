import path from "path";

export const lambdaRolePath = "/queue.run/";
export const buildDir = path.resolve(".build");
export const handler = "node_modules/@queue.run/runtime/dist/index.handler";

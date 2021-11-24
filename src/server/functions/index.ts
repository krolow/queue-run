import * as swc from "@swc/core";
import path from "path";
import vm from "vm";
import { QueueConfig, QueueHandler } from "../../../types";
import loadGroup from "./loadGroup";

type AllGroups = {
  queues: Map<
    string,
    { readonly handler: QueueHandler; readonly config: QueueConfig }
  >;
};

export default function loadAllModules(): AllGroups {
  if (!allGroups) {
    const sourceMaps = new Map<string, string>();
    require.extensions[".ts"] = compileTSWithSourceMap(sourceMaps);
    const watch = process.env.NODE_ENV === "development";
    allGroups = {
      queues: loadGroup("background/queue", watch),
    };
  }
  return allGroups;
}

let allGroups: AllGroups;

function compileTSWithSourceMap(sourceMaps: Map<string, string>) {
  return (module: NodeJS.Module, filename: string) => {
    const { code, map: sourceMap } = swc.transformFileSync(filename, {
      envName: process.env.NODE_ENV,
      env: { targets: { node: process.versions.node } },
      jsc: { parser: { syntax: "typescript" } },
      sourceMaps: true,
      module: { type: "commonjs" },
    });
    if (sourceMap) sourceMaps.set(filename, sourceMap);
    vm.compileFunction(
      code,
      ["exports", "require", "module", "__filename", "__dirname"],
      { filename }
    )(module.exports, module.require, module, filename, path.dirname(filename));
    module.loaded = true;
  };
}

import * as vm from "vm";
import { QueueConfig, QueueHandler } from "../../../types";
import loadDirectory from "./loadDirectory";

type ModuleTree = {
  queues: Map<
    string,
    { readonly handler: QueueHandler; readonly config: QueueConfig }
  >;
};

export default async function loadAllModules(): Promise<ModuleTree> {
  if (!loadingTree) {
    const global = vm.createContext({ console, process });
    loadingTree = (async () => {
      const watch = process.env.NODE_ENV === "development";
      return {
        queues: await loadDirectory({
          dirname: "background/queue",
          global,
          watch,
        }),
      };
    })();
  }
  return await loadingTree;
}

let loadingTree: Promise<ModuleTree>;

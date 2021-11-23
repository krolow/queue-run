import { Queue, Topic } from "../../../types";
import loadModules from "./loadModules";

type Topology = {
  queues: Map<string, Queue.Module>;
  topics: Map<string, Topic.Module>;
};

export default async function getTopology(): Promise<Topology> {
  const watch = process.env.NODE_ENV === "development";
  if (!topology) {
    topology = {
      queues: await loadModules("background/queue", watch),
      topics: await loadModules("background/topic", watch),
    };
  }
  return topology;
}

let topology: Topology;

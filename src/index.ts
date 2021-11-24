import { loadGroup } from "./server/functions";
import createQueues from "./server/queues/createQueues";
import pollMessages from "./server/queues/pollMessages";

process.env.NODE_ENV = process.env.NODE_ENV || "development";

async function setup() {
  try {
    const prefix = "untitled-dev";
    const queues = loadGroup("queue", true);
    await createQueues(prefix, queues);
    await pollMessages(prefix, queues);
    process.stdin.resume();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

setup();

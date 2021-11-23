import createQueues from "./server/queues/createQueues";
import receiveMessages from "./server/queues/receiveMessages";

process.env.NODE_ENV = process.env.NODE_ENV || "development";

async function setup() {
  try {
    await createQueues();
    await receiveMessages("untitled_dev");
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

setup();

import { QueueConfig } from "@assaf/untitled-runtime";
import glob from "glob";
import path from "path";
import { sqs } from "./clients";
import loadFunction from "./loadFunction";
import { queueURLToARN } from "./util";

export async function createQueues({
  dirname,
  prefix,
}: {
  dirname: string;
  prefix: string;
}): Promise<string[]> {
  console.info("µ: Loading source code with queue configurations …");
  const fromCode = await getQueuesFromCode(dirname);

  console.info("µ: Creating/updating queues …");
  return await Promise.all(
    Array.from(fromCode.entries()).map(async ([name, config]) => {
      const fifo = config.fifo ? ".fifo" : "";
      const { QueueUrl } = await sqs.createQueue({
        QueueName: `${prefix}${name}${fifo}`,
      });
      if (!QueueUrl) throw new Error(`Could not create queue ${name}`);
      const arn = queueURLToARN(QueueUrl);
      console.info("µ: Created queue %s", arn);
      return arn;
    })
  );
}

async function getQueuesFromCode(
  dirname: string
): Promise<Map<string, QueueConfig>> {
  const currentDir = process.cwd();
  try {
    process.chdir(dirname);

    const filenames = glob.sync(
      path.resolve("background", "queue", "[!_.]*.js")
    );
    const invalid = filenames.filter(
      (name) => !/^[a-zA-Z0-9_-]+\.js$/.test(path.basename(name))
    );
    if (invalid.length > 0) {
      const quoted = invalid.map((filename) => `'${filename}''`).join(", ");
      throw new Error(
        `Filename can only contain alphanumeric, hyphen, or underscore: ${quoted}`
      );
    }

    const queues = await Promise.all(
      filenames.map(async (filename) => {
        const exports = loadFunction(filename, false);
        const config = exports.config ?? {};
        const queueName = path.basename(filename, ".js");
        return [queueName, config] as [string, QueueConfig];
      })
    );
    return new Map(queues);
  } finally {
    process.chdir(currentDir);
  }
}

export async function deleteOldQueues(prefix: string, queueArns: string[]) {
  const { QueueUrls } = await sqs.listQueues({
    QueueNamePrefix: prefix,
  });
  if (!QueueUrls) return;

  const set = new Set(queueArns);
  const toDelete = QueueUrls.filter(
    (QueueUrl) => !set.has(queueURLToARN(QueueUrl))
  );
  if (toDelete.length === 0) return;

  console.info("µ: Deleting old queues %s …", toDelete.map(queueURLToARN));
  await Promise.all(
    toDelete.map(async (QueueUrl) => sqs.deleteQueue({ QueueUrl }))
  );
}

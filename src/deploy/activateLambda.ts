import { Lambda } from "@aws-sdk/client-lambda";
import { SQS } from "@aws-sdk/client-sqs";
import glob from "glob";
import path from "path";
import { QueueConfig } from "types";
import { loadFunction } from "../server/functions";
import uploadLambda from "./uploadLambda";
import { queueURLToARN } from "./util";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
const lambda = new Lambda({ profile: "untitled" });
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
const sqs = new SQS({ profile: "untitled" });

export default async function activateLambda({
  alias,
  dirname,
  lambdaName,
}: {
  alias: string;
  dirname: string;
  lambdaName: string;
}) {
  const prefix = `${alias}__`;
  const queueArns = await createQueues({ dirname, prefix });
  await removeTriggers(lambdaName, queueArns);

  const revisionId = await uploadLambda({ dirname, lambdaName });
  const { Version: version } = await lambda.publishVersion({
    FunctionName: lambdaName,
    RevisionId: revisionId,
  });
  if (!version) throw new Error("Could not publish function");

  const { AliasArn: aliasArn } = await lambda.updateAlias({
    FunctionName: lambdaName,
    FunctionVersion: version,
    Name: alias,
  });
  if (!aliasArn) throw new Error("Could not create alias");

  console.info("λ: Published %s", aliasArn);
  await addTriggers(aliasArn, queueArns);

  await deleteOldQueues(prefix, queueArns);
}

async function getQueuesFromCode(
  dirname: string
): Promise<Map<string, QueueConfig>> {
  const filenames = glob.sync(
    path.resolve(dirname, "background", "queue", "[!_.]*.js")
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
}

async function removeTriggers(lambdaName: string, sourceArns: string[]) {
  const { EventSourceMappings } = await lambda.listEventSourceMappings({
    FunctionName: lambdaName,
  });
  if (!EventSourceMappings) return;

  const set = new Set(sourceArns);
  const removing = EventSourceMappings.filter(
    ({ EventSourceArn }) => EventSourceArn && !set.has(EventSourceArn)
  );
  if (removing.length === 0) return;

  console.info(
    "λ: removing triggers %s",
    lambdaName,
    removing.map(({ EventSourceArn }) => EventSourceArn)
  );
  await Promise.all(
    removing.map(({ UUID }) => lambda.deleteEventSourceMapping({ UUID }))
  );
}

async function addTriggers(lambdaName: string, sourceArns: string[]) {
  if (sourceArns.length === 0) return;
  const { EventSourceMappings } = await lambda.listEventSourceMappings({
    FunctionName: lambdaName,
  });
  const existing = new Set(
    EventSourceMappings?.map(({ EventSourceArn }) => EventSourceArn) ?? []
  );
  const newArns = sourceArns.filter((arn) => !existing.has(arn));
  if (newArns.length === 0) return;

  console.info("λ: adding triggers %s", lambdaName, newArns);
  await Promise.all(
    newArns.map((arn) =>
      lambda.createEventSourceMapping({
        Enabled: true,
        FunctionName: lambdaName,
        EventSourceArn: arn,
      })
    )
  );
}

async function createQueues({
  dirname,
  prefix,
}: {
  dirname: string;
  prefix: string;
}): Promise<string[]> {
  const fromCode = await getQueuesFromCode(dirname);
  return await Promise.all(
    [...fromCode].map(async ([name]) => {
      const { QueueUrl } = await sqs.createQueue({
        QueueName: `${prefix}${name}`,
      });
      if (!QueueUrl) throw new Error(`Could not create queue ${name}`);
      const arn = queueURLToARN(QueueUrl);
      console.info("µ: Created queue %s", arn);
      return arn;
    })
  );
}

async function deleteOldQueues(prefix: string, queueArns: string[]) {
  const { QueueUrls } = await sqs.listQueues({
    QueueNamePrefix: prefix,
  });
  if (!QueueUrls) return;

  const set = new Set(queueArns);
  const toDelete = QueueUrls.filter(
    (QueueUrl) => !set.has(queueURLToARN(QueueUrl))
  );

  console.info("µ: Deleting queues %s", toDelete.map(queueURLToARN));
  await Promise.all(
    toDelete.map(async (QueueUrl) => sqs.deleteQueue({ QueueUrl }))
  );
}

import { QueueHandlerMetadata } from "queue-run";

export function onJobStarted(metadata: QueueHandlerMetadata) {
  console.info(
    "Started job %s on queue %s",
    metadata.jobID,
    metadata.queueName
  );
}

export function onJobFinished(metadata: QueueHandlerMetadata) {
  console.info(
    "Finished job %s on queue %s",
    metadata.jobID,
    metadata.queueName
  );
}

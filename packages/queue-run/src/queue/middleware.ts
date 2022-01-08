import { QueueHandlerMetadata } from "./exports.js";

export async function logJobStarted(job: QueueHandlerMetadata) {
  console.info(
    'Job started: queue="%s" job="%s" received=%d seq=%s',
    job.queueName,
    job.jobID,
    job.receivedCount,
    job.sequenceNumber ?? "--"
  );
}

export async function logJobFinished(job: QueueHandlerMetadata) {
  console.info('Job finished: queue="%s" job="%s"', job.queueName, job.jobID);
}

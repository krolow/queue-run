import { QueueHandlerMetadata } from "./exports";

export async function logJobStarted(job: QueueHandlerMetadata) {
  console.log(
    'Job started: queue="%s" job="%s" received=%d seq=%s',
    job.queueName,
    job.jobID,
    job.receivedCount,
    job.sequenceNumber ?? "--"
  );
}

export async function logJobFinished(job: QueueHandlerMetadata) {
  console.log('Job finished: queue="%s" job="%s"', job.queueName, job.jobID);
}

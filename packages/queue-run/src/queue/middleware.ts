import { JobMetadata } from "./exports.js";

/**
 * Default middleware that logs when a job starts running.
 *
 * @param job The job metadata
 */
export async function logJobStarted(job: JobMetadata) {
  console.info(
    'Job started: queue="%s" job="%s" received=%d seq=%s',
    job.queueName,
    job.jobID,
    job.processedCount,
    job.sequenceNumber ?? "--"
  );
}

/**
 * Default middleware that logs when a job finished running successfully.
 *
 * @param job The job metadata
 */
export async function logJobFinished(job: JobMetadata) {
  console.info('Job finished: queue="%s" job="%s"', job.queueName, job.jobID);
}

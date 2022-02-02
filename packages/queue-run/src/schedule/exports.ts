/* eslint-disable no-unused-vars */
import type { AbortSignal } from "node-abort-controller";
import type { OnError } from "../shared/onError.js";

/**
 * Scheduled job handler.
 *
 * @param metadata Metadata about the job
 */
export type ScheduleHandler = (
  metadata: ScheduledJobMetadata
) => Promise<void> | void;

/**
 * Job metadata.
 */
export type ScheduledJobMetadata = {
  /**
   * The job ID. (Unique for your project)
   */
  jobId: string;
  /**
   * The schedule name.
   */
  name: string;
  /**
   * The schedule as cron expression.
   */
  cron: string;
  /**
   * Abort signal notified when the job is aborted due to a timeout.
   */
  signal: AbortSignal;
};

/**
 * Export config object to control various aspects of job handling.
 */
export type ScheduleConfig = {
  /**
   * Timeout for processing the job (in seconds)
   *
   * @default 5 minutes
   */
  timeout?: number;
};

/**
 * Middleware that's called any time a job starts running.
 *
 * @param job The job metadata
 */
export type OnScheduledJobStarted = (
  job: ScheduledJobMetadata
) => Promise<void> | void;

/**
 * Middleware that's called any time a job finishes running successfully.
 *
 * @param job The job metadata
 */
export type OnScheduledJobFinished = (
  job: ScheduledJobMetadata
) => Promise<void> | void;

/**
 * Middleware exported from the schedule module, or schedules/_middleware.ts.
 */
export type ScheduleMiddleware = {
  onError?: OnError | null;
  onJobFinished?: OnScheduledJobFinished | null;
  onJobStarted?: OnScheduledJobStarted | null;
};

/**
 * Exported from the schedule module.
 */
export type ScheduleExports = {
  default: ScheduleHandler;
  config?: ScheduleConfig;
  schedule: string;
} & ScheduleMiddleware;

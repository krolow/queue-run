import { JobMetadata } from "../queue/exports.js";
import { WebSocketRequest } from "../ws/exports";

/* eslint-disable no-unused-vars */
/**
 * This middleware is called in the event of an error.
 *
 * @param error The error that was thrown
 * @param reference The reference object (HTTP request, job metadata, etc.)
 */
export type OnError = (
  error: Error,
  reference?: Request | JobMetadata | WebSocketRequest | undefined
) => Promise<void> | void;
/* eslint-enable no-unused-vars */

/* eslint-disable no-unused-vars */

/**
 * The warmup function is called before any requests are handled.
 * The warmup funciton is only useful if you have provisioned concurrency.
 */
export type WarmupFunction = () => Promise<void> | void;

/**
 * Backend configuration affecting all routes.
 */
export type BackendConfig = {
  /**
   * Memory size. Specified in megabytes (number) or string with the prefix MB
   * or GB.  Default is 128 MB..
   */
  memory?: number | `${number}${"mb" | "MB" | "gb" | "GB"}`;
};


/**
 * Exported from index.ts.
 */
export type BackendExports = {
  warmup?: WarmupFunction;
  config?: BackendConfig;
};

export { default as form } from "./form";
export * from "./http/fetch";
export { default as handleHTTPRequest } from "./http/handleHTTPRequest";
export { default as loadRoutes } from "./http/loadRoutes";
export * from "./localStorage";
export { default as handleQueuedJob } from "./queue/handleQueuedJob";
export { default as loadQueues } from "./queue/loadQueues";
export { default as queues } from "./queues";
export * from "./types";
export { default as url } from "./url";
export { default as xml } from "./xml";

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV: "development" | "production" | "test";
      QUEUE_RUN_ENV: "development" | "production" | "preview";
      QUEUE_RUN_URL: string;
      QUEUE_RUN_WS: string;
    }
  }
}

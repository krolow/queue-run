export * from "./http";
export * from "./queue";
export * from "./shared/localStorage";
export * from "./shared/logError";

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

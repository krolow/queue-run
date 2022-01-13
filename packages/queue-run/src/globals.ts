declare namespace NodeJS {
  interface ProcessEnv {
    readonly DEBUG: "false" | "true" | undefined;
    readonly NODE_ENV: "development" | "production" | "test";
    readonly QUEUE_RUN_ENV: "local" | "preview" | "production";
    readonly QUEUE_RUN_URL: string;
    readonly QUEUE_RUN_WS: string;
  }
}

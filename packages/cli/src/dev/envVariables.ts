import dotenv from "dotenv";

export default function envVariables(port: number) {
  dotenv.config({ path: ".env" });
  process.env.NODE_ENV = "development";
  process.env.QUEUE_RUN_ENV = "development";
  process.env.QUEUE_RUM_URL = `http://localhost:${port}`;
}

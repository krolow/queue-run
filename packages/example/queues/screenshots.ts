import { QueueConfig, queues } from "queue-run";
import * as db from "../lib/db";

type Payload = { id: string };

export default async function ({ id }: Payload) {
  const bookmark = await db.findOne(id);
  if (!bookmark) return;

  const screenshot = "screenshot.png";
  await db.updateOne({ id, screenshot });
}

export const config: QueueConfig = {};
export const queue = queues.self<Payload>();

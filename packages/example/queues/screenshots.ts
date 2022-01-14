import capture from "#lib/capture.js";
import * as db from "#lib/db.js";
import { QueueConfig, queues, socket } from "queue-run";

type Payload = { id: string };

export default async function ({ id }: Payload) {
  const bookmark = await db.findOne(id);
  if (!bookmark) return;

  const screenshot = await capture(bookmark.url);
  await db.updateOne({ id, screenshot });

  socket.send({ update: "screenshot", bookmark });
}

export const config: QueueConfig = {};
export const queue = queues.self<Payload>();

import * as bookmarks from "#lib/bookmarks.js";
import capture from "#lib/capture.js";
import { QueueConfig, queues, socket } from "queue-run";

type Payload = { id: string };

export default async function ({ id }: Payload) {
  const bookmark = await bookmarks.findOne(id);
  if (!bookmark) return;

  const screenshot = await capture(bookmark.url);
  await bookmarks.updateOne({ id, screenshot });

  await socket.send({ event: "refresh", bookmark });
}

export const config: QueueConfig = {};
export const queue = queues.self<Payload>();

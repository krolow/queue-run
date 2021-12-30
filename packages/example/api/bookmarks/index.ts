import { RouteConfig } from "queue-run";
import * as db from "../../lib/db";
import { queue } from "../../queues/screenshot";
import { Resource, urlForBookmark } from "./[id]";
import { input } from "./_middleware";

export async function get() {
  return await db.findAll();
}

export async function post({ request }: Resource) {
  const bookmark = await db.create(await input(request));
  await queue.push({ id: bookmark.id });

  const url = urlForBookmark(bookmark);
  return new Response(url, { status: 303, headers: { Location: url } });
}

export const config: RouteConfig = {
  cache: 60,
};

import { Response, RouteConfig } from "queue-run";
import * as db from "../../lib/db.js";
import { queue as screenshots } from "../../queues/screenshots.js";
import { urlForBookmark } from "./[id].js";

export async function get() {
  return await db.findAll();
}

export async function post({ body }: { body: { url: string; title: string } }) {
  const bookmark = await db.create(body);
  await screenshots.push({ id: bookmark.id });

  const url = urlForBookmark(bookmark);
  return Response.redirect(url, 303);
}

export const config: RouteConfig = {
  cache: 60,
};

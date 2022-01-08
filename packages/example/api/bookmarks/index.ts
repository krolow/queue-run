import { Request, Response, RouteConfig } from "queue-run";
import * as db from "../../lib/db.js";
import { queue as screenshots } from "../../queues/screenshots.js";
import { urlForBookmark } from "./[id].js";
import { input } from "./_middleware.js";

export async function get() {
  return await db.findAll();
}

export async function post({ request }: { request: Request }) {
  const bookmark = await db.create(await input(request));
  await screenshots.push({ id: bookmark.id });

  const url = urlForBookmark(bookmark);
  return new Response(url, { status: 303, headers: { Location: url } });
}

export const config: RouteConfig = {
  cache: 60,
};

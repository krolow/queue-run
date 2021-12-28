import { RouteConfig } from "queue-run";
import * as db from "../../lib/db";
import { urlForBookmark } from "./[id]";
import { input } from "./_middleware";

export async function get() {
  return await db.load();
}

export async function post(request: Request) {
  const { title, url } = await input(request);
  const bookmark = await db.create({ title, url });
  return new Response(null, {
    status: 303,
    headers: { Location: urlForBookmark(bookmark) },
  });
}

export const config: RouteConfig = {
  accepts: "application/json",
  cache: 60,
};

import { Request, RouteConfig } from "queue-run";
import * as db from "../../lib/db";
import { urlForBookmark } from "./[id]";
import { input } from "./_middleware";

export async function get() {
  return await db.load();
}

export async function post(request: Request) {
  const bookmark = await db.create(await input(request));
  const url = urlForBookmark(bookmark);
  return new Response(url, { status: 303, headers: { Location: url } });
}

export const config: RouteConfig = {
  cache: 60,
};

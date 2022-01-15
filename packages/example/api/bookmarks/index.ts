import * as bookmarks from "#lib/bookmarks.js";
import { RouteConfig } from "queue-run";
import { urlForBookmark } from "./[id].js";

export async function get() {
  return await bookmarks.findAll();
}

export async function post({ body }: { body: { url: string; title: string } }) {
  const bookmark = await bookmarks.create(body);
  const url = urlForBookmark(bookmark);
  return Response.redirect(url, 303);
}

export const config: RouteConfig = {
  cache: 60,
};

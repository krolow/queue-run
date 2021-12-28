import * as db from "../../lib/db";
import { urlForBookmark } from "./[id]";

export async function get() {
  return await db.load();
}

export async function post(request: Request) {
  const { title, url } = await request.json();
  const bookmark = await db.create({
    title,
    url,
  });
  return new Response("", {
    status: 303,
    headers: { Location: urlForBookmark(bookmark) },
  });
}

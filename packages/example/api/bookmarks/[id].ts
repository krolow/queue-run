import { url } from "queue-run";
import * as db from "../../lib/db";

export async function get(request, { params }: { params: { id: string } }) {
  const bookmark = await db.find(params.id);
  if (!bookmark) throw new Response(null, { status: 404 });
  return bookmark;
}

export async function del(request, { params }: { params: { id: string } }) {
  await db.del(params.id);
  return "OK";
}

export async function put(request, { params }: { params: { id: string } }) {
  const { title, url } = await request.json();
  const bookmark = await db.update({
    id: params.id,
    title,
    url,
  });
  if (!bookmark) throw new Response(null, { status: 404 });
  return bookmark;
}

export const urlForBookmark = url.self<{ id: string }>();

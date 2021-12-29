import { Request, RouteConfig, url } from "queue-run";
import * as db from "../../lib/db";
import { input } from "./_middleware";

type ID = { id: string };

export async function get(_request, { params }: { params: ID }) {
  const bookmark = await db.find(params.id);
  if (!bookmark) throw new Response(null, { status: 404 });
  return bookmark;
}

export async function del(_request, { params }: { params: ID }) {
  await db.del(params.id);
  return new Response(null, { status: 204 });
}

export async function put(request: Request, { params }: { params: ID }) {
  const bookmark = await db.find(params.id);
  if (!bookmark) throw new Response(null, { status: 404 });
  const { title, url } = await input(request);
  return await db.update({ id: params.id, title, url });
}

export const urlForBookmark = url.self<ID, never>();

export const config: RouteConfig = {
  cache: 60,
};

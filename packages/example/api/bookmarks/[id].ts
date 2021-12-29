import { Request, RouteConfig, url } from "queue-run";
import * as db from "../../lib/db";
import { input } from "./_middleware";

type ID = { id: string };

export async function get(_, { params }: { params: ID }) {
  const bookmark = await db.findOne(params.id);
  if (!bookmark) throw new Response(null, { status: 404 });
  return bookmark;
}

export async function put(request: Request, { params }: { params: ID }) {
  const bookmark = await db.findOne(params.id);
  if (!bookmark) throw new Response(null, { status: 404 });

  const { title, url } = await input(request);
  return await db.updateOne({ id: params.id, title, url });
}

export async function del(_, { params }: { params: ID }) {
  await db.deleteOne(params.id);
  return new Response(null, { status: 204 });
}

export const urlForBookmark = url.self<ID, never>();

export const config: RouteConfig = {
  cache: 60,
};

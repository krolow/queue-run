import * as db from "#lib/db.js";
import { RouteConfig, url } from "queue-run";

export type Resource = {
  body?: { title: string };
  params: { id: string };
};

export async function get({ params }: Resource) {
  const bookmark = await db.findOne(params.id);
  if (!bookmark) throw new Response(undefined, { status: 404 });
  return bookmark;
}

export async function put({ body, params }: Resource) {
  const bookmark = await db.findOne(params.id);
  if (!bookmark) throw new Response(undefined, { status: 404 });

  const { title } = body!;
  return await db.updateOne({ id: params.id, title });
}

export async function del({ params }: Resource) {
  await db.deleteOne(params.id);
  return new Response(undefined, { status: 204 });
}

export const urlForBookmark = url.self<Resource["params"], never>();

export const config: RouteConfig = {
  cache: 60,
};

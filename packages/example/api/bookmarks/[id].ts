import { Request, RouteConfig, url } from "queue-run";
import * as db from "~/lib/db";
import { input } from "./_middleware";

export type Resource = { request: Request; params: { id: string } };

export async function get({ params }: Resource) {
  const bookmark = await db.findOne(params.id);
  if (!bookmark) throw new Response(null, { status: 404 });
  return bookmark;
}

export async function put({ request, params }: Resource) {
  const bookmark = await db.findOne(params.id);
  if (!bookmark) throw new Response(null, { status: 404 });

  const { title } = await input(request);
  return await db.updateOne({ id: params.id, title });
}

export async function del({ params }: Resource) {
  await db.deleteOne(params.id);
  return new Response(null, { status: 204 });
}

export const urlForBookmark = url.self<Resource["params"], never>();

export const config: RouteConfig = {
  cache: 60,
};

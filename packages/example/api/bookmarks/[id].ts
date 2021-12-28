import { RouteConfig, url } from "queue-run";
import * as db from "../../lib/db";
import { input } from "./_middleware";

type Params = { id: string };

export async function get(_request, { params }: { params: Params }) {
  const bookmark = await db.find(params.id);
  if (!bookmark) throw new Response(null, { status: 404 });
  return bookmark;
}

export async function del(_request, { params }: { params: Params }) {
  await db.del(params.id);
  return new Response(null, { status: 204 });
}

export async function put(request: Request, { params }: { params: Params }) {
  const { title, url } = await input(request);
  const bookmark = await db.update({ id: params.id, title, url });
  if (!bookmark) throw new Response(null, { status: 404 });
  return bookmark;
}

export const urlForBookmark = url.self<Params>();

export const config: RouteConfig = {
  accepts: "application/json",
  cache: 60,
};

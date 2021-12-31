import ow from "ow";
import { form, Request } from "queue-run";
import * as db from "~/lib/db";

export async function authenticate(request: Request) {
  const header = request.headers.get("Authorization");
  const token = header && header.match(/^Bearer (.*)$/)?.[1];
  if (!token)
    throw new Response("Missing Authorization header with bearer token", {
      status: 401,
    });
  const user = await db.authenticate(token);
  if (!user) throw new Response("Access Denied!", { status: 403 });
  return user;
  // TODO: verify JWT token
  // TODO: example with signed cookies
}

export async function input(request: Request) {
  // HTML form or JSON document we're not particular

  console.log(await form(request.clone()));

  const { title, url } = await form(request.clone()).catch(() =>
    request.json()
  );

  // Validate inputs early and validate inputs often
  try {
    ow(url, ow.string.url.matches(/^https?:/).message("HTTP/S URL required"));
    ow(title, ow.string.nonEmpty.message("Title is required"));
    return { title, url };
  } catch (error) {
    throw new Response(String(error), { status: 422 });
  }
}

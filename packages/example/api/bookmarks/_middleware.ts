import * as db from "../../lib/db";

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
}

export async function onRequest(request: Request) {
  console.log("Request for %s", request.url);
}

export async function input(request: Request): Promise<{
  title: string;
  url: string;
}> {
  try {
    const { title, url } = await request.json();
    new URL(url);
    if (title.trim().length === 0) throw new Error('"title" is required');
    return { title, url };
  } catch (error) {
    throw new Response(String(error), { status: 400 });
  }
}

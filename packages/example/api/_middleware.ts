import * as bookmarks from "#lib/bookmarks.js";

export async function authenticate(request: Request) {
  const header = request.headers.get("Authorization");
  const token = header && header.match(/^Bearer (.*)$/)?.[1];
  if (!token)
    throw new Response("Missing Authorization header with bearer token", {
      status: 401,
    });
  const user = await bookmarks.authenticate(token);
  if (!user) throw new Response("Access Denied!", { status: 403 });
  console.log("🔑 Authenticated user:", user.id);
  return user;
  // TODO: verify JWT token
  // TODO: example with signed cookies
}

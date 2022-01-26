import * as bookmarks from "#lib/bookmarks.js";

export async function authenticate({ bearerToken }: { bearerToken: string }) {
  if (!bearerToken)
    throw new Response("Missing Authorization header with bearer token", {
      status: 401,
    });
  const user = await bookmarks.authenticate(bearerToken);
  if (!user) throw new Response("Access Denied!", { status: 403 });
  console.info("🔑 Authenticated user:", user.id);
  return user;
  // TODO: verify JWT token
  // TODO: example with signed cookies
}

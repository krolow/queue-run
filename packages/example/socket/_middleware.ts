import * as bookmarks from "#lib/bookmarks.js";

export async function authenticate(request: Request) {
  const token = "secret";
  const user = await bookmarks.authenticate(token);
  if (!user) throw new Response("Access Denied!", { status: 403 });
  console.log("🔑 Authenticated user:", user.id);
  return user;
}

export async function onMessageSent({ data }: { data: Buffer }) {
  console.log("WebSocket sending:", data.toString());
}

export async function onOnline(userId: string) {
  console.info(`User ${userId} went online`);
}

export async function onOffline(userId: string) {
  console.info(`User ${userId} went offline`);
}

export { authenticate } from "#api/bookmarks/_middleware.js";

export async function onMessageSent({ data }: { data: Buffer }) {
  console.log("WebSocket sending:", data.toString());
}

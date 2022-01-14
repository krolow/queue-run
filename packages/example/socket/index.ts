import { socket } from "queue-run";

export default async function () {
  setTimeout(async function () {
    await socket.send("hello");
  }, 3000);

  return "Welcome";
}

export const config = {
  type: "text",
};

export { authenticate } from "#api/bookmarks/_middleware.js";

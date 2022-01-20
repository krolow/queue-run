import * as bookmarks from "#lib/bookmarks.js";
import { authenticated, socket } from "queue-run";

export default async function () {
  const user = await bookmarks.authenticate("secret");
  await authenticated(user);
  await socket.send({ message: "👋 Welcome!" });
}

export const config = {
  type: "text",
};

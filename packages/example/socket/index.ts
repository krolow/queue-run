import { socket } from "queue-run";

export default async function () {
  await socket.send({ message: "👋 Welcome!" });
}

export const config = {
  type: "text",
};

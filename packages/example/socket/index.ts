import { socket } from "queue-run";

export default async function () {
  setTimeout(() => {
    socket.send("async");
  }, 1000);

  return "Welcome";
}

export const config = {
  type: "text",
};

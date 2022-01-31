import { socket } from "queue-run";

export async function authenticate({ data }: { data: { token: string } }) {
  if (data.token === "secret") {
    await socket.send<string>("✅ Authenticated!");
    return { id: "user-id" };
  } else await socket.close();
}

export async function onMessageSent({ data }: { data: Buffer }) {
  console.info("WebSocket sending:", data.toString());
}

export async function onOnline(userId: string) {
  console.info(`User ${userId} went online`);
}

export async function onOffline(userId: string) {
  console.info(`User ${userId} went offline`);
}

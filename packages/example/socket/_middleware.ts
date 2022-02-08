import { socket } from "queue-run";

export async function authenticate({ data }: { data: { token?: string } }) {
  if (data.token === "secret") {
    await socket.send<string>("✅ Authenticated!");
    return { id: "user-id" };
  } else await socket.close();
}

export async function onOnline({ id }: { id: string }) {
  console.info(`User ${id} went online`);
}

export async function onOffline({ id }: { id: string }) {
  console.info(`User ${id} went offline`);
}

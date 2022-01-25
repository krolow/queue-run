export async function onMessageSent({ data }: { data: Buffer }) {
  console.info("WebSocket sending:", data.toString());
}

export async function onOnline(userId: string) {
  console.info(`User ${userId} went online`);
}

export async function onOffline(userId: string) {
  console.info(`User ${userId} went offline`);
}

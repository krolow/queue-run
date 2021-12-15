import { readFile } from "fs/promises";
import fetch from "node-fetch";
import { URL } from "url";

export default async function pushMessage(
  queueName: string,
  message: string,
  { port, group }: { port: number; group?: string }
) {
  const body = await getMessageBody(message);
  const path = queueName.endsWith(".fifo")
    ? `/queue/${queueName}/${group ?? "group-x"}`
    : `/queue/${queueName}`;
  const url = new URL(path, `http://localhost:${port}`);
  const response = await fetch(url.href, { method: "POST", body });
  if (!response.ok)
    throw new Error(`${response.status}: ${await response.text()}`);
  const { messageId } = await response.json();
  console.info("Queued message %s", messageId);
}

async function getMessageBody(message: string): Promise<string> {
  if (message === "-") return await readFile("/dev/stdin", "utf8");
  else if (message.startsWith("@"))
    return await readFile(message.slice(1), "utf-8");
  else return message;
}

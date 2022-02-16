import fs from "node:fs/promises";
import readline from "node:readline";

export default async function readPayload(
  payload: string | undefined
): Promise<string> {
  if (payload === "-") return await fs.readFile("/dev/stdin", "utf-8");
  else if (payload?.startsWith("@"))
    return await fs.readFile(payload.slice(1), "utf-8");
  else if (payload) return payload;
  else {
    if (process.stdin.isTTY) {
      console.info(
        "Type your message then Ctrl+D on an empty line (Ctrl+C to exit)"
      );
    }
    const rl = readline.createInterface({
      input: process.stdin,
      prompt: "",
    });
    rl.on("SIGINT", () => process.exit(-1));
    const lines = [];
    for await (const line of rl) lines.push(line);
    return lines.join("\n");
  }
}

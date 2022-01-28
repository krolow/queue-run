import filesize from "filesize";
/**
 * Default middleware for WebSocket logs all received messages.
 */
export async function logMessageReceived({
  connectionId,
  data,
  user,
}: {
  connectionId: string;
  data: unknown;
  user: { id: string; [key: string]: unknown } | null;
}) {
  const message =
    typeof data === "string"
      ? filesize(data.length)
      : Buffer.isBuffer(data)
      ? filesize(data.byteLength)
      : "json";

  console.info(
    "connection: %s user: %s message: %s",
    connectionId,
    user?.id ?? "anonymous",
    message
  );
}

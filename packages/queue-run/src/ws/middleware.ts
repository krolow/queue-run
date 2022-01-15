/**
 * Default middleware for WebSocket logs all received messages.
 */
export async function logMessageReceived({
  connection,
  data,
  user,
}: {
  connection: string;
  data: object | string | Buffer;
  user: { id: string; [key: string]: unknown } | null;
}) {
  const message =
    typeof data === "string"
      ? `${data.length} bytes`
      : Buffer.isBuffer(data)
      ? `${data.byteLength} bytes`
      : "json";
  console.info("%s: %s from %s", connection, message, user?.id ?? "anonymous");
}

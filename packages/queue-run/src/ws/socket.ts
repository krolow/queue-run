import { Blob } from "../http/fetch.js";
import { getLocalStorage } from "../shared/localStorage.js";
import { onMessageSentAsync } from "./handler.js";

type Payload = object | string | ArrayBuffer | Blob | Buffer;

/**
 * From within WebSocket handler, you can use this to respond to the client, or
 * close the connection.
 *
 * From within HTTP request handler, or queued job handler, you can use this to
 * send a message to the authenticated user, or specific set of users.
 *
 * ```
 * await socket.send(updates);
 * ```
 *
 * ```
 * await socket.to(users).send(updates);
 * ```
 */
class WebSocket<T extends Payload = object> {
  private _userIds: string[] | null;

  constructor(userIds: string[] | null) {
    this._userIds = userIds ? Array.from(new Set(userIds)) : null;
  }

  /**
   * Close the WebSocket connection.
   */
  async close(): Promise<void> {
    const local = getLocalStorage();
    const connections = await this.getConnections();
    await Promise.all(
      connections.map((connection) => local.closeWebSocket(connection))
    );
  }

  /**
   * Send a message.
   *
   * You can direct the message at a specific user (or users), by calling the
   * `to` method.
   *
   * Otherwise, from within a socket handler, this uses the current connection.
   * From withing request or job handler, the current user.
   *
   * ```
   * await socket.send({ status: "ok" });
   * ```
   *
   * @param data Message to send, can be an object (serialized as JSON), a
   * string, or a blob/buffer
   * @throws Error if the message cannot be sent, connection closed, or if no user specified
   */
  async send(data: T): Promise<void> {
    const local = getLocalStorage();
    const connections = await this.getConnections();
    const message = await payloadToBuffer(data as unknown as Payload);
    await Promise.all(
      connections.map((connection) =>
        local.sendWebSocketMessage(message, connection)
      )
    );
    await onMessageSentAsync({
      data: message,
      connections: connections,
    });
  }

  private async getConnections(): Promise<string[]> {
    const local = getLocalStorage();

    // In order of precedence:
    // - Users explicitly specified
    // - All connections for current user
    // - Current connection
    if (this._userIds) return await local.getConnections(this._userIds);
    if (local.user) return await local.getConnections([local.user.id]);
    if (local.connectionId) return [local.connectionId];

    throw new Error(
      "This only works within a socket handler, with an authenticated user, or with explicit list of users"
    );
  }

  /**
   * Send the next message to the specified users.
   *
   *
   * ```
   * await socket.to(userA).send({ status: "ok" });
   * ```
   *
   * ```
   * const members = group.map((user) => user.id);
   * await socket.to(members).send({ status: "ok" });
   * ```
   *
   * @param userIds One or more user IDs, as returned from the authenticate middleware
   * @returns The web socket set with the specified users
   */
  to(userIds: string | string[]): WebSocket<T> {
    if (!userIds) throw new Error("User ID is required");
    return new WebSocket(Array.isArray(userIds) ? userIds : [userIds]);
  }

  /**
   * Returns true if the user has an open WebSocket connection.
   *
   * @param userId The user ID
   * @returns true if the user has an open WebSocket connection
   */
  async isOnline(userId: string): Promise<boolean> {
    const local = getLocalStorage();
    const connections = await local.getConnections([userId]);
    return connections.length > 0;
  }

  toString() {
    return (
      this._userIds?.join(", ") ??
      getLocalStorage().connectionId ??
      "unavailable"
    );
  }

  /**
   * Returns the WebSocket URL (wss:// in production, ws:// in development)
   */
  get url() {
    return getLocalStorage().urls.ws;
  }
}

export default new WebSocket(null);

async function payloadToBuffer(data: Payload): Promise<Buffer> {
  if (typeof data === "string") return Buffer.from(data);
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (data instanceof Blob) return Buffer.from(await data.arrayBuffer());
  const indent = Number(process.env.QUEUE_RUN_INDENT) || 0;
  return Buffer.from(JSON.stringify(data, null, indent));
}

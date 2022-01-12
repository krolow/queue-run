import { getLocalStorage } from "../shared/index.js";

type Payload = object | string | ArrayBuffer | Blob | Buffer;

/**
 * WebSockets object associated with the current request.
 *
 * From within WebSocket handler, you can use this to respond to the client, or
 * close the connection.
 *
 * From within HTTP request handler, or queued job handler, you can use this to
 * send a message to the authenticated user, or specific set of users.
 *
 * ```
 * await sockets.send(updates);
 * ```
 *
 * ```
 * await sockets.to(users).send(updates);
 * ```
 */
class WebSockets<T = Payload> {
  private _userIDs: string[] | null;

  constructor(userIDs: string[] | null) {
    this._userIDs = userIDs;
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
   * await sockets.send({ status: "ok" });
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
  }

  private async getConnections(): Promise<string[]> {
    const local = getLocalStorage();
    if (this._userIDs) return await local.getConnections(this._userIDs);

    if (local.connection) return [local.connection];
    if (local.user) return await local.getConnections([local.user.id]);

    throw new Error(
      "Not called within a socket handler, and no authenticated user"
    );
  }

  /**
   * Send the next message to the specified users.
   *
   *
   * ```
   * await sockets.to(userA).send({ status: "ok" });
   * ```
   *
   * ```
   * const members = group.map((user) => user.id);
   * await sockets.to(members).send({ status: "ok" });
   * ```
   *
   * @param userIDs One or more user IDs, as returned from the authenticate middleware
   * @returns The web socket set with the specified users
   */
  to(userIDs: string | string[]): WebSockets<T> {
    if (!userIDs) throw new Error("User ID is required");
    const ids = Array.isArray(userIDs) ? userIDs : [userIDs];
    return new WebSockets(ids);
  }

  toString() {
    return (
      this._userIDs?.join(",") ?? getLocalStorage().connection ?? "unavailable"
    );
  }
}

export default new WebSockets(null);

async function payloadToBuffer(data: Payload): Promise<Buffer> {
  if (typeof data === "string") return Buffer.from(data);
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (data instanceof Blob) return Buffer.from(await data.arrayBuffer());
  const indent = Number(process.env.QUEUE_RUN_INDENT) || 0;
  return Buffer.from(JSON.stringify(data, null, indent));
}

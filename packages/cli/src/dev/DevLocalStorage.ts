import crypto from "crypto";
import { EventEmitter } from "events";
import { handleQueuedJob, LocalStorage } from "queue-run";
import { WebSocket } from "ws";

export default class DevLocalStorage extends LocalStorage {
  // All open websockets by unique socket ID
  //
  // Sockets added/removed by server, since the API is ID based
  public sockets = new Map<string, WebSocket>();

  // Index all open sockets belonging to a given user
  private socketsByUserID = new Map<string, string[]>();
  // Index of user ID for a given socket
  private userIDBySocket = new Map<string, string>();

  // Number of jobs in the queue
  private queued = 0;
  // Emit idle event when queue is empty
  private events = new EventEmitter();

  constructor(port: number) {
    super({
      urls: {
        http: `http://localhost:${port}`,
        ws: `ws://localhost:${port + 1}`,
      },
    });
  }

  async queueJob({
    queueName,
    groupID,
    payload,
    params,
    user,
  }: {
    queueName: string;
    groupID?: string | undefined;
    payload: string | Buffer | object;
    params?: { [key: string]: string | string[] };
    user?: { id: string };
  }) {
    const jobID = crypto.randomBytes(4).toString("hex");
    const serializedPayload =
      typeof payload === "string" || Buffer.isBuffer(payload)
        ? payload
        : JSON.parse(JSON.stringify(payload));
    const serializedParams = Object.entries(params ?? {}).reduce(
      (acc, [key, value]) => ({
        ...acc,
        [String(key)]: String(value),
      }),
      {}
    );
    const userID = user?.id ? String(user.id) : undefined;

    ++this.queued;
    setImmediate(() => {
      this.exit(async () => {
        try {
          await handleQueuedJob({
            queueName,
            metadata: {
              groupID,
              jobID,
              params: serializedParams,
              queueName,
              receivedCount: 1,
              sentAt: new Date(),
              sequenceNumber: 1,
              user: userID ? { id: userID } : null,
            },
            payload: serializedPayload,
            newLocalStorage: () => this,
            remainingTime: 30 * 1000,
          });
        } finally {
          --this.queued;
          if (this.queued === 0) this.events.emit("idle");
        }
      });
    });
    return jobID;
  }

  onWebSocketAccepted({
    userID,
    socketID,
  }: {
    userID: string;
    socketID: string;
  }) {
    this.userIDBySocket.set(socketID, userID);
    this.socketsByUserID.set(userID, [
      socketID,
      ...(this.socketsByUserID.get(userID) ?? []),
    ]);
  }

  onWebSocketClosed(socketID: string) {
    const userID = this.userIDBySocket.get(socketID);
    if (!userID) return;

    this.userIDBySocket.delete(userID);
    const userSockets = this.socketsByUserID.get(userID);
    const withoutSocket = userSockets?.filter((entry) => entry !== socketID);
    if (withoutSocket?.length) this.socketsByUserID.set(userID, withoutSocket);
    else this.socketsByUserID.delete(userID);
  }

  async sendWebSocketMessage({
    message,
    userIDs,
  }: {
    message: string | Buffer | object;
    userIDs: string[];
  }) {
    const sockets = userIDs
      .map((userID) => this.socketsByUserID.get(userID) ?? [])
      .flat()
      .map((socketID) => this.sockets.get(socketID))
      .filter(Boolean) as WebSocket[];
    await Promise.all(
      sockets.map(
        (ws) =>
          new Promise((resolve, reject) =>
            ws.send(message, (error) => {
              if (error) reject(error);
              else resolve(undefined);
            })
          )
      )
    );
  }

  onIdleOnce(cb: () => void) {
    this.events.once("idle", cb);
  }
}

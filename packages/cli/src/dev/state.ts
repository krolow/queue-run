import crypto from "crypto";
import { EventEmitter } from "node:events";
import { handleQueuedJob, LocalStorage } from "queue-run";
import { WebSocket } from "ws";

// All open websockets by unique socket ID
//
// Sockets added/removed by server, since the API is ID based
const sockets = new Map<string, WebSocket>();

// Index all open sockets belonging to a given user
const wsUserConnections = new Map<string, string[]>();
// Index of user ID for a given socket
const wsConnectionUserID = new Map<string, string>();

// Number of jobs in the queue
let queued = 0;
// Emit idle event when queue is empty
const events = new EventEmitter();

export class DevLocalStorage extends LocalStorage {
  private port;

  constructor(port: number) {
    super({
      urls: {
        http: `http://localhost:${port}`,
        ws: `ws://localhost:${port + 1}`,
      },
    });
    this.port = port;
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

    ++queued;
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
              queuedAt: new Date(),
              sequenceNumber: 1,
              user: userID ? { id: userID } : null,
            },
            payload: serializedPayload,
            newLocalStorage: () => new DevLocalStorage(this.port),
            remainingTime: 30 * 1000,
          });
        } finally {
          --queued;
          if (queued === 0) events.emit("idle");
        }
      });
    });
    return jobID;
  }

  async sendWebSocketMessage(message: Buffer, connection: string) {
    const socket = sockets.get(connection);
    if (socket) {
      await new Promise((resolve, reject) =>
        socket.send(message, (error) => {
          if (error) reject(error);
          else resolve(undefined);
        })
      );
    }
  }

  async getConnections(userIDs: string[]) {
    return userIDs.map((userID) => wsUserConnections.get(userID) ?? []).flat();
  }

  async closeWebSocket(connection: string) {
    const socket = sockets.get(connection);
    if (socket) socket.terminate();
  }
}

export function onIdleOnce(cb: () => void) {
  events.once("idle", cb);
}

export function onWebSocketAccepted(socket: WebSocket, userID: string | null) {
  const id = crypto.randomBytes(4).toString("hex");
  sockets.set(id, socket);

  if (userID) {
    wsConnectionUserID.set(id, userID);
    wsUserConnections.set(userID, [
      id,
      ...(wsUserConnections.get(userID) ?? []),
    ]);
  }
  return id;
}

export function onWebSocketClosed(connection: string) {
  sockets.delete(connection);
  const userID = wsConnectionUserID.get(connection);
  if (userID) {
    wsConnectionUserID.delete(connection);
    wsUserConnections.delete(userID);
  }
}

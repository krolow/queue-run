import ms from "ms";
import crypto from "node:crypto";
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
const wsConnectionUserId = new Map<string, string>();

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
    groupId,
    payload,
    params,
    user,
  }: {
    queueName: string;
    groupId?: string | undefined;
    payload: string | Buffer | object;
    params?: { [key: string]: string | string[] };
    user?: { id: string };
  }) {
    const jobId = crypto.randomBytes(4).toString("hex");
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
    const userId = user?.id ? String(user.id) : undefined;

    ++queued;
    setImmediate(() => {
      this.exit(async () => {
        try {
          await handleQueuedJob({
            queueName,
            metadata: {
              groupId,
              jobId,
              params: serializedParams,
              queueName,
              receivedCount: 1,
              queuedAt: new Date(),
              sequenceNumber: 1,
              user: userId ? { id: userId } : null,
            },
            payload: serializedPayload,
            newLocalStorage: () => new DevLocalStorage(this.port),
            remainingTime: ms("30s"),
          });
        } finally {
          --queued;
          if (queued === 0) events.emit("idle");
        }
      });
    });
    return jobId;
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

  async getConnections(userIds: string[]) {
    return userIds.map((userId) => wsUserConnections.get(userId) ?? []).flat();
  }

  async closeWebSocket(connection: string) {
    const socket = sockets.get(connection);
    if (socket) socket.terminate();
  }
}

export function onIdleOnce(cb: () => void) {
  events.once("idle", cb);
}

export function onWebSocketAccepted({
  connection,
  socket,
  userId,
}: {
  connection: string;
  socket: WebSocket;
  userId: string | null;
}) {
  sockets.set(connection, socket);

  if (userId) {
    wsConnectionUserId.set(connection, userId);
    wsUserConnections.set(userId, [
      connection,
      ...(wsUserConnections.get(userId) ?? []),
    ]);
  }
  return connection;
}

export function onWebSocketClosed(connection: string) {
  sockets.delete(connection);
  const userId = wsConnectionUserId.get(connection);
  if (userId) {
    wsConnectionUserId.delete(connection);
    wsUserConnections.delete(userId);
  }
}

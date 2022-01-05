import crypto from "crypto";
import { EventEmitter } from "events";
import { handleQueuedJob, LocalStorage } from "queue-run";

let queued = 0;
export const events = new EventEmitter();

class DevLocalStorage extends LocalStorage {
  private port: number;

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
    groupID?: string;
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
              sentAt: new Date(),
              sequenceNumber: 1,
              user: userID ? { id: userID } : null,
            },
            payload: serializedPayload,
            newLocalStorage: () => newLocalStorage(this.port),
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
}

export function newLocalStorage(port: number): LocalStorage {
  return new DevLocalStorage(port);
}

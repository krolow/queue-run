import crypto from "crypto";
import { EventEmitter } from "events";
import { handleQueuedJob, LocalStorage } from "queue-run";

let queued = 0;
export const events = new EventEmitter();

export function newLocalStorage(port: number): LocalStorage {
  return {
    queueJob: async ({ queueName, groupID, payload, params, user }) => {
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
      const userId = user?.id ? String(user.id) : undefined;

      ++queued;
      setImmediate(async () => {
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
              user: userId ? { id: userId } : undefined,
            },
            payload: serializedPayload,
            newLocalStorage: () => newLocalStorage(port),
            remainingTime: 30 * 1000,
          });
        } finally {
          --queued;
          if (queued === 0) events.emit("idle");
        }
      });
      return jobID;
    },

    sendWebSocketMessage: async () => undefined,

    urls: {
      http: `http://localhost:${port}`,
      ws: `ws://localhost:${port + 1}`,
    },
  };
}

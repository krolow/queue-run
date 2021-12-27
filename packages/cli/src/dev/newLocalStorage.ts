import crypto from "crypto";
import { EventEmitter } from "events";
import { handleQueuedJob, LocalStorage } from "queue-run";

let queued = 0;
export const events = new EventEmitter();

export function newLocalStorage(port: number): LocalStorage {
  return {
    queueJob: async ({ queueName, groupID, payload, params }) => {
      const jobID = crypto.randomBytes(4).toString("hex");

      ++queued;
      setImmediate(async () => {
        try {
          await handleQueuedJob({
            queueName,
            metadata: {
              groupID,
              jobID,
              params: params ?? {},
              queueName,
              receivedCount: 1,
              sentAt: new Date(),
            },
            payload,
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

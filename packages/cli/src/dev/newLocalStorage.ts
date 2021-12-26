import crypto from "crypto";
import { handleQueuedJob, LocalStorage } from "queue-run";

export function newLocalStorage(): LocalStorage {
  return {
    queueJob: async ({ queueName, groupID, payload, params }) => {
      const messageID = crypto.randomBytes(4).toString("hex");

      setImmediate(() =>
        handleQueuedJob({
          queueName,
          metadata: {
            groupID,
            messageID,
            params: params ?? {},
            queueName,
            receivedCount: 1,
            sentAt: new Date(),
          },
          payload,
          newLocalStorage,
          remainingTime: 30 * 1000,
        })
      );
      return messageID;
    },

    sendWebSocketMessage: async () => undefined,
  };
}

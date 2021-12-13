import axios, { AxiosInstance } from "axios";

type Payload = string | Buffer | ArrayBuffer | object;

class Client {
  readonly axios: AxiosInstance;

  constructor({ url, token }: { url: string; token: string }) {
    this.axios = axios.create({ baseURL: url });
    this.axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
  }

  public async queue(
    name: string,
    payload: Payload,
    options?: {
      // Group ID required when sending to a FIFO queue
      groupId?: string;
      // Dedupe ID is optional, used to prevent processing same message multiple times (FIFO queues only)
      dedupeId?: string;
    }
  ): Promise<{ messageId: string }> {
    const isFifo = name.endsWith(".fifo");
    if (isFifo && !options?.groupId)
      throw new TypeError("options.groupId is required for FIFO queue");
    const fifoHeaders = isFifo
      ? {
          "X-Message-Group-Id": options?.groupId,
          "X-Message-Deduplication-Id": options?.dedupeId,
        }
      : undefined;

    const { data, status } = await this.axios.post<{ messageId: string }>(
      `/queue/${name}`,
      {
        method: "POST",
        data: payload,
        headers: {
          "Content-Type": getContentType(payload),
          ...fifoHeaders,
        },
      }
    );
    if (status !== 200) throw new Error(`Unexpected response status ${status}`);

    const { messageId } = data;
    return { messageId };
  }
}

function getContentType(payload: Payload): string {
  if (typeof payload === "string" || payload instanceof String)
    return "text/plain";
  if (payload instanceof Buffer || payload instanceof ArrayBuffer)
    return "text/plain";
  return "application/json";
}

export function client(options: { url: string; token: string }) {
  return new Client(options);
}

export default client;

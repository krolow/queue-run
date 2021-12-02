import { SQS } from "@aws-sdk/client-sqs";

export class Client {
  private sqs: SQS;

  constructor() {
    this.sqs = new SQS({
      region: "us-east-1",
      credentials: {
        accessKeyId: "123456789012",
        secretAccessKey: "123456789012",
      },
    });
  }

  async queue(name: string): Promise<(payload: unknown) => Promise<undefined>>;
  async queue(name: string, payload: unknown): Promise<undefined>;
  async queue(name: string, payload?: unknown) {
    if (payload === undefined)
      return (payload: unknown) => this.queue(name, payload);

    if (typeof payload === "object")
      await this.sqs.sendMessage({
        QueueUrl: `https://sqs.us-east-1.amazonaws.com/123456789012/${name}`,
        MessageBody: JSON.stringify(payload),
        MessageAttributes: {
          type: {
            DataType: "String",
            StringValue: "json",
          },
        },
      });
    return undefined;
  }
}

export const client = new Client();
export default client;

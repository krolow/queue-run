import { SQS } from "@aws-sdk/client-sqs";
import { QueueConfig, QueueHandler } from "../types";
import getPayload from "./getPayload";
import { SQSMessage } from "./SQSEvent";

const sqs = new SQS({});

export default class RunOrder {
  private config: QueueConfig;
  private handler: QueueHandler;
  private messages: Array<SQSMessage> = [];
  private queueName: string;

  constructor(queueName: string, handler: QueueHandler, config: QueueConfig) {
    this.config = config;
    this.handler = handler;
    this.queueName = queueName;
  }

  addMessage(message: SQSMessage) {
    this.messages.push(message);
  }

  async handleAllMessages() {
    return this.config.fifo ? this.runInSequence() : this.runInParallel();
  }

  private async runInParallel() {
    await Promise.all(
      this.messages.map(async (message) => {
        try {
          await this.handleOneMessage(message);
        } catch {
          // Ignore errors
        }
      })
    );
  }

  private async runInSequence() {
    for (const message of this.messages) {
      try {
        await this.handleOneMessage(message);
      } catch {
        break;
      }
    }
  }

  private async deleteMessage(message: SQSMessage) {
    const [, , , region, accountId, queueName] =
      message.eventSourceARN.split(":");
    const queueUrl = `https://sqs.${region}.amazonaws.com/${accountId}/${queueName}`;
    await sqs.deleteMessage({
      QueueUrl: queueUrl,
      ReceiptHandle: message.receiptHandle,
    });
  }

  private async handleOneMessage(message: SQSMessage) {
    try {
      console.info(
        "Handling message %s on queue %s",
        message.messageId,
        this.queueName
      );
      await this.handler(getPayload(message));
      console.info(
        "Deleting message %s on queue %s",
        message.messageId,
        this.queueName
      );
      await this.deleteMessage(message);
    } catch (error) {
      console.error(
        "Error with message %s on queue %s",
        message.messageId,
        this.queueName,
        error
      );
      throw error;
    }
  }
}

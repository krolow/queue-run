export { default as handleSQSMessages } from "./handleSQSMessages";
export { default as pushMessage } from "./pushMessage";

export declare type SQSMessage = {
  attributes: {
    ApproximateFirstReceiveTimestamp: string;
    ApproximateReceiveCount: string;
    MessageDeduplicationId?: string;
    MessageGroupId?: string;
    SenderId: string;
    SentTimestamp: string;
    SequenceNumber?: string;
  };
  awsRegion: string;
  body: string;
  eventSource: "aws:sqs";
  eventSourceARN: string;
  md5OfBody: string;
  messageAttributes: {
    [key: string]: {
      stringValue: string;
    };
  };
  messageId: string;
  receiptHandle: string;
};

export declare type LambdaEvent = {
  Records: Array<SQSMessage | SNSMessage>;
};

// See https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html
export declare type SQSMessage = {
  attributes: SQSMessageAttributes;
  awsRegion: string;
  body: string;
  eventSource: "aws:sqs";
  eventSourceARN: string;
  md5OfBody: string;
  messageAttributes: { [key: string]: { stringValue: string } };
  messageId: string;
  receiptHandle: string;
};

type SQSMessageAttributes = {
  ApproximateFirstReceiveTimestamp: string;
  ApproximateReceiveCount: string;
  SenderId: string;
  SentTimestamp: string;
} & Partial<SQSFifoMessageAttributes>;

type SQSFifoMessageAttributes = {
  MessageDeduplicationId: string;
  MessageGroupId: string;
  SequenceNumber: string;
};

export declare type SQSFifoMessage = SQSMessage & {
  attributes: SQSMessageAttributes & SQSFifoMessageAttributes;
};

export declare type SNSMessage = {
  eventSource: "aws:sns";
};

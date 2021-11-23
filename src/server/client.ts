import { SQSClient } from "@aws-sdk/client-sqs";

export default new SQSClient({
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

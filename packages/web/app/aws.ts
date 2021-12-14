import { DynamoDB } from "@aws-sdk/client-dynamodb";
import { SQS } from "@aws-sdk/client-sqs";
import dotenv from "dotenv";
import invariant from "tiny-invariant";

invariant(process.env.CREDENTIALS, "CREDENTIALS env var is required");

const credentials = dotenv.parse<{
  aws_access_key_id: string;
  aws_secret_access_key: string;
  aws_region: string;
}>(process.env.CREDENTIALS);

const config = {
  credentials: {
    accessKeyId: credentials.aws_access_key_id,
    secretAccessKey: credentials.aws_secret_access_key,
  },
  region: credentials.aws_region,
  logger: console,
};

export const dynamoDB = new DynamoDB(config);
export const sqs = new SQS(config);

import { DynamoDB } from "@aws-sdk/client-dynamodb";

const [accessKeyId, secretAccessKey] = process.env.AWS_MAIN!.split(":");
const dynamoDB = new DynamoDB({
  credentials: { accessKeyId, secretAccessKey },
  region: process.env.AWS_REGION,
});
export default dynamoDB;

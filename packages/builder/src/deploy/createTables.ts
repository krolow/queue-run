import { DynamoDB } from "@aws-sdk/client-dynamodb";
import ora from "ora";

export async function createTables(region: string): Promise<void> {
  const dynamoDB = new DynamoDB({ region });
  const spinner = ora(`Setting up database tables`).start();

  if (!(await hasTable(dynamoDB, "qr-connections"))) {
    await dynamoDB.createTable({
      TableName: "qr-connections",
      AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
      BillingMode: "PAY_PER_REQUEST",
    });
  }

  if (!(await hasTable(dynamoDB, "qr-user-connections"))) {
    await dynamoDB.createTable({
      TableName: "qr-user-connections",
      AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
      BillingMode: "PAY_PER_REQUEST",
    });
  }
  spinner.succeed();
}

async function hasTable(dynamoDB: DynamoDB, name: string): Promise<boolean> {
  try {
    const { Table } = await await dynamoDB.describeTable({ TableName: name });
    return !!Table;
  } catch (error) {
    if (
      typeof error === "object" &&
      (error as { code?: string }).code !== "ResourceNotFoundException"
    )
      return false;

    throw error;
  }
}

import { DynamoDB } from "@aws-sdk/client-dynamodb";
import ora from "ora";

const dynamoDB = new DynamoDB({});

export async function createTables(): Promise<void> {
  const spinner = ora(`Setting up database tables`).start();

  if (!(await hasTable("qr-connections"))) {
    await dynamoDB.createTable({
      TableName: "qr-connections",
      AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
      BillingMode: "PAY_PER_REQUEST",
    });
  }

  if (!(await hasTable("qr-user-connections"))) {
    await dynamoDB.createTable({
      TableName: "qr-user-connections",
      AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
      BillingMode: "PAY_PER_REQUEST",
    });
  }
  spinner.succeed();
}

async function hasTable(name: string): Promise<boolean> {
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

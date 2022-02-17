import { CreateTableCommandInput, DynamoDB } from "@aws-sdk/client-dynamodb";
import ora from "ora";

export async function createTables(region: string): Promise<void> {
  const dynamoDB = new DynamoDB({ region });
  const spinner = ora(`Setting up database tables`).start();

  await Promise.all([
    createTable(dynamoDB, {
      TableName: "qr-connections",
      AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
      BillingMode: "PAY_PER_REQUEST",
    }),

    createTable(dynamoDB, {
      TableName: "qr-user-connections",
      AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
      BillingMode: "PAY_PER_REQUEST",
    }),

    createTable(dynamoDB, {
      TableName: "qr-env-vars",
      AttributeDefinitions: [
        { AttributeName: "project", AttributeType: "S" },
        { AttributeName: "env", AttributeType: "S" },
      ],
      KeySchema: [
        { AttributeName: "project", KeyType: "HASH" },
        { AttributeName: "env", KeyType: "RANGE" },
      ],
      BillingMode: "PAY_PER_REQUEST",
    }),
  ]);

  spinner.succeed();
}

async function createTable(dynamoDB: DynamoDB, table: CreateTableCommandInput) {
  if (await hasTable(dynamoDB, table.TableName!)) return;
  await dynamoDB.createTable(table);

  let created = false;
  do {
    await new Promise((resolve) => setTimeout(resolve, 500));
    created = await hasTable(dynamoDB, table.TableName!);
  } while (!created);
}

async function hasTable(dynamoDB: DynamoDB, name: string): Promise<boolean> {
  try {
    const { Table } = await dynamoDB.describeTable({ TableName: name });
    return Table?.TableStatus === "ACTIVE";
  } catch (error) {
    if ((error as { name?: string }).name !== "ResourceNotFoundException")
      throw error;
    return false;
  }
}

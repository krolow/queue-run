import { DynamoDB } from "@aws-sdk/client-dynamodb";

export async function getEnvVariables({
  environment,
  project,
  region,
}: {
  environment: string;
  project: string;
  region: string;
}): Promise<Map<string, string>> {
  const dynamoDB = new DynamoDB({ region });
  const tableName = `qr-${project}-env-vars`;
  try {
    const { Items } = await dynamoDB.scan({
      TableName: tableName,
      FilterExpression: "env = :env",
      ExpressionAttributeValues: { ":env": { S: environment } },
    });
    const envVars = new Map();
    for (const { name, val } of Items!) envVars.set(name!.S, val!.S);
    return envVars;
  } catch (error) {
    if ((error as { name: string }).name !== "ResourceNotFoundException")
      throw error;
    return new Map();
  }
}

export async function setEnvVariable({
  environment,
  project,
  region,
  varName,
  varValue,
}: {
  environment: string;
  project: string;
  region: string;
  varName: string;
  varValue: string;
}): Promise<void> {
  if (!/^[a-zA-Z0-9-_]+$/.test(varName))
    throw new Error(
      "Environment variable must be alphanumeric, dash, or underscore"
    );

  const dynamoDB = new DynamoDB({ region });
  const tableName = `qr-${project}-env-vars`;
  await createTable(dynamoDB, tableName);

  await dynamoDB.updateItem({
    TableName: tableName,
    Key: { name: { S: varName }, env: { S: environment } },
    UpdateExpression: "SET val = :varValue",
    ExpressionAttributeValues: { ":varValue": { S: varValue } },
  });
}

export async function deleteEnvVariable({
  environment,
  project,
  region,
  varName,
}: {
  environment: string;
  project: string;
  region: string;
  varName: string;
}): Promise<void> {
  if (!/^[a-zA-Z0-9-_]+$/.test(varName))
    throw new Error(
      "Environment variable must be alphanumeric, dash, or underscore"
    );

  try {
    const dynamoDB = new DynamoDB({ region });
    const tableName = `qr-${project}-env-vars`;
    await dynamoDB.deleteItem({
      TableName: tableName,
      Key: { name: { S: varName }, env: { S: environment } },
    });
  } catch (error) {
    if ((error as { name: string }).name !== "ResourceNotFoundException")
      throw error;
  }
}

export async function deleteEnvVariables({
  project,
  region,
}: {
  project: string;
  region: string;
}): Promise<void> {
  try {
    const dynamoDB = new DynamoDB({ region });
    const tableName = `qr-${project}-env-vars`;
    await dynamoDB.deleteTable({ TableName: tableName });
  } catch (error) {
    if ((error as { name: string }).name !== "ResourceNotFoundException")
      throw error;
  }
}

async function createTable(dynamoDB: DynamoDB, tableName: string) {
  if (await hasTable(dynamoDB, tableName)) return;
  await dynamoDB.createTable({
    TableName: tableName,
    AttributeDefinitions: [
      { AttributeName: "name", AttributeType: "S" },
      { AttributeName: "env", AttributeType: "S" },
    ],
    KeySchema: [
      { AttributeName: "name", KeyType: "HASH" },
      { AttributeName: "env", KeyType: "RANGE" },
    ],
    BillingMode: "PAY_PER_REQUEST",
  });

  let created = false;
  do {
    await new Promise((resolve) => setTimeout(resolve, 500));
    created = await hasTable(dynamoDB, tableName);
  } while (!created);
}

async function hasTable(
  dynamoDB: DynamoDB,
  tableName: string
): Promise<boolean> {
  try {
    const { Table } = await dynamoDB.describeTable({ TableName: tableName });
    return Table?.TableStatus === "ACTIVE";
  } catch (error) {
    if ((error as { name?: string }).name !== "ResourceNotFoundException")
      throw error;
    return false;
  }
}

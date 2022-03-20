import { DynamoDB } from "@aws-sdk/client-dynamodb";

const tableName = "qr-env-vars";

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
  try {
    const { Item } = await dynamoDB.getItem({
      TableName: tableName,
      Key: { project: { S: project }, env: { S: environment } },
    });
    const envVars = new Map();
    if (Item?.vars?.M)
      for (const [name, value] of Object.entries(Item.vars.M!))
        envVars.set(name, value.S);
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
  try {
    await dynamoDB.describeTable({ TableName: tableName });
  } catch (error) {
    if ((error as { name: string }).name !== "ResourceNotFoundException")
      throw error;
    await createTable(dynamoDB);
  }

  try {
    await dynamoDB.updateItem({
      TableName: tableName,
      Key: { project: { S: project }, env: { S: environment } },
      UpdateExpression: "SET vars = :empty",
      ConditionExpression: "attribute_not_exists(vars)",
      ExpressionAttributeValues: { ":empty": { M: {} } },
    });
  } catch (error) {
    if ((error as { name: string }).name !== "ConditionalCheckFailedException")
      throw error;
  }
  await dynamoDB.updateItem({
    TableName: tableName,
    Key: { project: { S: project }, env: { S: environment } },
    UpdateExpression: "SET vars.#varName = :varValue",
    ExpressionAttributeNames: { "#varName": varName },
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
    await dynamoDB.updateItem({
      TableName: tableName,
      Key: { project: { S: project }, env: { S: environment } },
      UpdateExpression: "REMOVE vars.#varName",
      ExpressionAttributeNames: { "#varName": varName },
    });
  } catch (error) {
    if ((error as { name: string }).name !== "ResourceNotFoundException")
      throw error;
  }
}

async function createTable(dynamoDB: DynamoDB) {
  if (await hasTable(dynamoDB)) return;
  await dynamoDB.createTable({
    TableName: tableName,
    AttributeDefinitions: [
      { AttributeName: "project", AttributeType: "S" },
      { AttributeName: "env", AttributeType: "S" },
    ],
    KeySchema: [
      { AttributeName: "project", KeyType: "HASH" },
      { AttributeName: "env", KeyType: "RANGE" },
    ],
    BillingMode: "PAY_PER_REQUEST",
  });

  let created = false;
  do {
    await new Promise((resolve) => setTimeout(resolve, 500));
    created = await hasTable(dynamoDB);
  } while (!created);
}

async function hasTable(dynamoDB: DynamoDB): Promise<boolean> {
  try {
    const { Table } = await dynamoDB.describeTable({ TableName: tableName });
    return Table?.TableStatus === "ACTIVE";
  } catch (error) {
    if ((error as { name?: string }).name !== "ResourceNotFoundException")
      throw error;
    return false;
  }
}

import { DynamoDB } from "@aws-sdk/client-dynamodb";
import { createTables } from "./create_tables.js";

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
    await createTables(region);
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

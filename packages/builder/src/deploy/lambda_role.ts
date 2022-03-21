import { IAM } from "@aws-sdk/client-iam";
import ora from "ora";
import invariant from "tiny-invariant";
import { lambdaRolePath } from "../constants.js";

const assumeRolePolicy = {
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Principal: {
        Service: ["lambda.amazonaws.com", "apigateway.amazonaws.com"],
      },
      Action: "sts:AssumeRole",
    },
  ],
};

// Returns ARN for a role that only applies to the named function.
export async function createLambdaRole({
  lambdaName,
  region,
}: {
  lambdaName: string;
  region: string;
}): Promise<string> {
  const spinner = ora("Creating execution role").start();
  try {
    const iam = new IAM({ region });
    const roleName = lambdaName;
    const roleArn = await getRoleArn(iam, roleName);
    if (roleArn) return roleArn;

    const { Role: newRole } = await iam.createRole({
      Path: lambdaRolePath,
      RoleName: roleName,
      AssumeRolePolicyDocument: JSON.stringify(assumeRolePolicy),
    });
    invariant(newRole?.Arn);
    return newRole.Arn;
  } finally {
    spinner.succeed();
  }
}

async function getRoleArn(iam: IAM, roleName: string): Promise<string | null> {
  try {
    const { Role: role } = await iam.getRole({ RoleName: roleName });
    if (role) {
      invariant(role.Arn);
      return role.Arn;
    }
  } catch (error) {
    if (!(error instanceof Error && error.name === "NoSuchEntity")) throw error;
  }
  return null;
}

export async function deleteLambdaRole({
  lambdaName,
  region,
}: {
  lambdaName: string;
  region: string;
}) {
  const roleName = lambdaName;
  const iam = new IAM({ region });
  try {
    await iam.deleteRole({ RoleName: roleName });
  } catch (error) {
    if (!(error instanceof Error && error.name === "NoSuchEntity")) throw error;
  }
}

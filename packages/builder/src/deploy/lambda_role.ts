import { IAM } from "@aws-sdk/client-iam";
import ora from "ora";
import invariant from "tiny-invariant";

const lambdaRolePath = "/queue-run/projects/";

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
  const iam = new IAM({ region });
  const roleName = lambdaName;

  try {
    const { Role: role } = await iam.getRole({ RoleName: roleName });
    if (role) {
      spinner.succeed();
      invariant(role.Arn);
      return role.Arn;
    }
  } catch (error) {
    if (!(error instanceof Error && error.name === "NoSuchEntity")) throw error;
  }

  const { Role: newRole } = await iam.createRole({
    Path: lambdaRolePath,
    RoleName: roleName,
    AssumeRolePolicyDocument: JSON.stringify(assumeRolePolicy),
  });
  invariant(newRole?.Arn);
  // If we don't wait for IAM here, we may get the error:
  // "The role defined for the function cannot be assumed by Lambda."
  await new Promise((resolve) => setTimeout(resolve, 3000));
  spinner.succeed();
  return newRole.Arn;
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
    await iam.deleteRolePolicy({ RoleName: roleName, PolicyName: "queue-run" });
    await iam.deleteRole({ RoleName: roleName });
  } catch (error) {
    if (!(error instanceof Error && error.name === "NoSuchEntity")) throw error;
  }
}

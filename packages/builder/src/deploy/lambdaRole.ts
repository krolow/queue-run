import { IAM, Role } from "@aws-sdk/client-iam";
import ora from "ora";
import invariant from "tiny-invariant";

const lambdaRolePath = "/queue-run/projects/";

const Version = "2012-10-17";

const assumeRolePolicy = {
  Version,
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

const LambdaPolicy = {
  Version,
  Statement: [
    {
      Effect: "Allow",
      Action: [
        "sqs:ChangeMessageVisibility",
        "sqs:ChangeMessageVisibilityBatch",
        "sqs:DeleteMessage",
        "sqs:GetQueueAttributes",
        "sqs:GetQueueUrl",
        "sqs:ReceiveMessage",
        "sqs:SendMessage",
      ],
      Resource: `arn:aws:sqs:*`,
    },
    {
      Effect: "Allow",
      Action: "logs:CreateLogGroup",
      Resource: `arn:aws:logs:us-east-1:122210178198:/aws/lambda/*`,
    },
    {
      Effect: "Allow",
      Action: ["logs:CreateLogStream", "logs:PutLogEvents"],
      Resource: [`arn:aws:logs:us-east-1:122210178198:log-group:/aws/lambda/*`],
    },
  ],
};

// Returns ARN for a role that only applies to the named function.
export async function getLambdaRole({
  lambdaName,
}: {
  lambdaName: string;
}): Promise<string> {
  const spinner = ora("Updating role/permissions").start();
  const iam = new IAM({});
  const roleName = lambdaName;
  const role = await upsertRole(iam, roleName);
  invariant(role.Arn, "Role has no ARN");
  await updatePolicy(iam, role);
  spinner.succeed(`Update role "${roleName}"`);
  return role.Arn;
}

async function upsertRole(iam: IAM, roleName: string): Promise<Role> {
  try {
    const { Role: role } = await iam.getRole({ RoleName: roleName });
    if (role) return role;
  } catch (error) {
    if (!(error instanceof Error && error.name === "NoSuchEntity")) throw error;
  }

  const { Role: newRole } = await iam.createRole({
    Path: lambdaRolePath,
    RoleName: roleName,
    AssumeRolePolicyDocument: JSON.stringify(assumeRolePolicy),
  });
  invariant(newRole, "Failed to create role");
  return newRole;
}

async function updatePolicy(iam: IAM, role: Role) {
  await iam.putRolePolicy({
    RoleName: role.RoleName,
    PolicyName: "queue-run",
    PolicyDocument: JSON.stringify(LambdaPolicy),
  });
}

export async function deleteLambdaRole({ lambdaName }: { lambdaName: string }) {
  const iam = new IAM({});
  await iam.deleteRole({
    RoleName: lambdaName,
  });
}

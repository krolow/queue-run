import { IAM, Role } from "@aws-sdk/client-iam";
import invariant from "tiny-invariant";

const lambdaRolePath = "/services/queuerun";

const Version = "2012-10-17";

const assumeRolePolicy = {
  Version,
  Statement: [
    {
      Effect: "Allow",
      Principal: { Service: "lambda.amazonaws.com" },
      Action: "sts:AssumeRole",
    },
  ],
};

const SQSPolicy = {
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
  ],
};

const CloudWatchLogPolicy = {
  Version,
  Statement: [
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
  const iam = new IAM({});
  const role = await upsertRole(iam, lambdaName);
  invariant(role.Arn, "Role has no ARN");

  await updatePolicies(iam, role);
  return role.Arn;
}

async function upsertRole(iam: IAM, lambdaName: string): Promise<Role> {
  const roleName = lambdaName;
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

  console.info("λ: Created role %s", roleName);
  return newRole;
}

async function updatePolicies(iam: IAM, role: Role) {
  await Promise.all([
    updatePolicy(iam, role, "CloudWatch", CloudWatchLogPolicy),
    updatePolicy(iam, role, "SQS", SQSPolicy),
  ]);
}

async function updatePolicy(
  iam: IAM,
  role: Role,
  policyName: string,
  policy: unknown
) {
  await iam.putRolePolicy({
    RoleName: role.RoleName,
    PolicyName: policyName,
    PolicyDocument: JSON.stringify(policy),
  });
  console.info("λ: Updated policy %s", policyName);
}

export async function deleteLambdaRole({ lambdaName }: { lambdaName: string }) {
  const iam = new IAM({});
  await iam.deleteRole({
    RoleName: lambdaName,
  });
}

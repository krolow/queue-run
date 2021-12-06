import type { Role } from "@aws-sdk/client-iam";
import { IAM } from "@aws-sdk/client-iam";
import invariant from "tiny-invariant";
import { lambdaRolePath } from "../constants";

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

function getSQSPolicy(lambdaName: string) {
  return {
    Version,
    Statement: [
      {
        Effect: "Allow",
        Action: [
          "sqs:ChangeMessageVisibility",
          "sqs:ChangeMessageVisibilityBatch",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes",
          "sqs:ReceiveMessage",
        ],
        Resource: `arn:aws:sqs:${lambdaName}__`,
      },
    ],
  };
}

function getCloudWatchLogPolicy(lambdaName: string) {
  return {
    Version,
    Statement: [
      {
        Effect: "Allow",
        Action: "logs:CreateLogGroup",
        Resource: `arn:aws:logs:us-east-1:122210178198:aws/lambda/${lambdaName}`,
      },
      {
        Effect: "Allow",
        Action: ["logs:CreateLogStream", "logs:PutLogEvents"],
        Resource: [
          `arn:aws:logs:us-east-1:122210178198:log-group:/aws/lambda/${lambdaName}/*`,
        ],
      },
    ],
  };
}

export default async function createLambdaRole({
  lambdaName,
  region,
}: {
  lambdaName: string;
  region: string;
}): Promise<string> {
  const iam = new IAM({ region });

  const role = await upsertRole(iam, lambdaName);
  invariant(role.Arn, "Role has no ARN");

  await updatePolicies(iam, role, lambdaName);
  return role.Arn;
}

async function upsertRole(iam: IAM, lambdaName: string): Promise<Role> {
  const roleName = `Lambda.${lambdaName}`;
  const { Role: role } = await iam.getRole({ RoleName: roleName });
  if (role) return role;

  const { Role: newRole } = await iam.createRole({
    Path: lambdaRolePath,
    RoleName: roleName,
    AssumeRolePolicyDocument: JSON.stringify(assumeRolePolicy),
  });
  invariant(newRole, "Failed to create role");

  console.info("λ: Created role %s", roleName);
  return newRole;
}

async function updatePolicies(iam: IAM, role: Role, lambdaName: string) {
  await Promise.all([
    updatePolicy(iam, role, "CloudWatch", getCloudWatchLogPolicy(lambdaName)),
    updatePolicy(iam, role, "SQS", getSQSPolicy(lambdaName)),
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

import { IAM, Role } from "@aws-sdk/client-iam";
import { lambdaAssumeRoleName, lambdaAssumeRolePath } from "./constants";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
const iam = new IAM({ profile: "untitled" });

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

const policies = {
  Logging: {
    Version,
    Statement: [
      {
        Effect: "Allow",
        Action: "logs:CreateLogGroup",
        Resource: "arn:aws:logs:us-east-1:122210178198:*",
      },
      {
        Effect: "Allow",
        Action: ["logs:CreateLogStream", "logs:PutLogEvents"],
        Resource: [
          "arn:aws:logs:us-east-1:122210178198:log-group:/aws/lambda/*",
        ],
      },
    ],
  },
  SQSReceive: {
    Version,
    Statement: [
      {
        Effect: "Allow",
        Action: [
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes",
          "sqs:ReceiveMessage",
        ],
        Resource: "arn:aws:sqs:*",
      },
    ],
  },
};

export default async function createLambdaRole(): Promise<Role> {
  const role = await upsertRole();
  await updatePolicies(role);
  return role;
}

async function upsertRole(): Promise<Role> {
  const { Roles } = await iam.listRoles({
    PathPrefix: lambdaAssumeRolePath,
  });
  const existing = Roles?.find((r) => r.RoleName === lambdaAssumeRoleName);
  if (existing) return existing;

  const { Role: newRole } = await iam.createRole({
    Path: lambdaAssumeRolePath,
    RoleName: lambdaAssumeRoleName,
    AssumeRolePolicyDocument: JSON.stringify(assumeRolePolicy),
  });
  if (!newRole) throw new Error("Failed to create role");

  console.info("λ: Created role %s", newRole.Arn);
  return newRole;
}

async function updatePolicies(role: Role) {
  for (const [policyName, policy] of Object.entries(policies)) {
    const {
      $metadata: { httpStatusCode },
    } = await iam.putRolePolicy({
      RoleName: role.RoleName,
      PolicyName: policyName,
      PolicyDocument: JSON.stringify(policy),
    });
    if (httpStatusCode !== 200)
      throw new Error(`Failed to update policy ${policyName}`);
    console.info("λ: Updated policy %s %s", role.Arn, policyName);
  }
}

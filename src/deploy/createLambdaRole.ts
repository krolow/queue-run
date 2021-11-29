import { IAM, Role } from "@aws-sdk/client-iam";

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

const rolePath = "/untitled/";

const roleName = "Untitled.Lambda";

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

export default async function createLambdaRole() {
  const role = await upsertRole();
  await updatePolicies(role);
}

async function upsertRole(): Promise<Role> {
  const { Roles } = await iam.listRoles({
    PathPrefix: rolePath,
  });
  const existing = Roles?.find((r) => r.RoleName === roleName);
  if (existing) return existing;

  const { Role: newRole } = await iam.createRole({
    Path: rolePath,
    RoleName: roleName,
    AssumeRolePolicyDocument: JSON.stringify(assumeRolePolicy),
  });
  if (!newRole) throw new Error("Failed to create role");

  console.debug("Created role %s", newRole.Arn);
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
    console.debug("Updated inline policy %s for role %s", policyName, role.Arn);
  }
}

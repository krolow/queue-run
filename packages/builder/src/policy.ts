export default function policy(slug?: string) {
  const lambdaPrefix = `qr-${slug ?? "*"}`;
  const lambdaArn = `arn:aws:lambda:*:*:function:${lambdaPrefix}`;

  return {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: ["apigateway:*", "acm:*"],
        Resource: "*",
      },
      {
        Effect: "Allow",
        Action: ["iam:GetUser"],
        Resource: "*",
      },
      {
        Effect: "Allow",
        Action: ["logs:*"],
        Resource: `arn:aws:logs:*:*:log-group:/aws/lambda/${lambdaPrefix}`,
      },
      {
        Effect: "Allow",
        Action: ["lambda:*"],
        Resource: lambdaArn,
      },
      {
        Effect: "Allow",
        Action: ["lambda:*"],
        Resource: "*",
        Condition: {
          StringLike: {
            "lambda:FunctionArn": lambdaArn,
          },
        },
      },
      {
        Effect: "Allow",
        Action: ["lambda:ListEventSourceMappings"],
        Resource: "*",
      },
      {
        Effect: "Allow",
        Action: [
          "iam:GetRole",
          "iam:GetRolePolicy",
          "iam:ListAttachedRolePolicies",
          "iam:ListRolePolicies",
          "iam:PassRole",
          "iam:SimulatePrincipalPolicy",
          "iam:CreateRole",
          "iam:DeleteRole",
          "iam:PutRolePolicy",
        ],
        Resource: "arn:aws:iam::*:role/*",
      },
      {
        Effect: "Allow",
        Action: "iam:PassRole",
        Resource: [lambdaArn, "arn:aws:iam::*:role/qr-*"],
        Condition: {
          StringEquals: {
            "iam:PassedToService": "lambda.amazonaws.com",
          },
        },
      },
      {
        Action: [
          "sqs:CreateQueue",
          "sqs:DeleteQueue",
          "sqs:GetQueueAttributes",
          "sqs:GetQueueUrl",
          "sqs:SetQueueAttributes",
          "sqs:SendMessage",
        ],
        Effect: "Allow",
        Resource: "arn:aws:sqs:*:*:*",
      },
      {
        Action: ["sqs:ListQueues"],
        Effect: "Allow",
        Resource: "*",
      },
      {
        Action: ["dynamodb:*"],
        Effect: "Allow",
        Resource: [
          "arn:aws:dynamodb:*:*:table/qr-connections",
          "arn:aws:dynamodb:*:*:table/qr-env-vars",
          "arn:aws:dynamodb:*:*:table/qr-user-connections",
        ],
      },
      {
        Action: ["events:*"],
        Effect: "Allow",
        Resource: "arn:aws:events:*:*:rule/*",
      },
      {
        Action: ["cloudwatch:*"],
        Effect: "Allow",
        Resource: "*",
      },
    ],
  };
}

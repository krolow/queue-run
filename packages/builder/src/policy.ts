export default function policy(slug?: string) {
  const lambdaPrefix = slug ? `qr-${slug}` : `qr-*`;
  const lambdaArn = `arn:aws:lambda:*:*:function:${lambdaPrefix}`;

  return {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: [
          "apigateway:*",
          "acm:DeleteCertificate",
          "acm:DescribeCertificate",
          "acm:RequestCertificate",
          "acm:ListCertificates",
        ],
        Resource: "*",
      },
      {
        Effect: "Allow",
        Action: ["iam:GetUser"],
        Resource: "*",
      },
      {
        Effect: "Allow",
        Action: [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:DescribeLogGroups",
          "logs:FilterLogEvents",
          "logs:PutLogEvents",
        ],
        Resource: `arn:aws:logs:*:*:log-group:/aws/lambda/${lambdaPrefix}`,
      },
      {
        Effect: "Allow",
        Action: ["lambda:*"],
        Resource: lambdaArn,
      },
      {
        Effect: "Allow",
        Action: [
          "lambda:CreateEventSourceMapping",
          "lambda:DeleteEventSourceMapping",
          "lambda:UpdateEventSourceMapping",
        ],
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
        Action: [
          "dynamodb:CreateTable",
          "dynamodb:DeleteItem",
          "dynamodb:DescribeTable",
          "dynamodb:GetItem",
          "dynamodb:UpdateItem",
        ],
        Effect: "Allow",
        Resource: [
          "arn:aws:dynamodb:*:*:table/qr-connections",
          "arn:aws:dynamodb:*:*:table/qr-env-vars",
          "arn:aws:dynamodb:*:*:table/qr-user-connections",
        ],
      },
      {
        Action: [
          "events:DescribeRule",
          "events:ListRuleNamesByTarget",
          "events:PutRule",
          "events:PutTargets",
        ],
        Effect: "Allow",
        Resource: "arn:aws:events:*:*:rule/*",
      },
    ],
  };
}

/* eslint-disable sonarjs/no-duplicate-string */
import { CreateStackInput } from "@aws-sdk/client-cloudformation";
import cloudform, {
  ApiGatewayV2,
  DynamoDB,
  Events,
  Fn,
  IAM,
  Lambda,
  ResourceBase,
  SQS,
} from "cloudform";
import cronParser from "cron-parser";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { loadManifest, Manifest } from "queue-run";
import invariant from "tiny-invariant";
import { cloudFormationFilename, httpStage, wsStage } from "../constants.js";

export async function createStackTemplate({
  buildDir,
  description,
  httpApiId,
  lambdaArn,
  websocketApiId,
}: {
  buildDir: string;
  description: string;
  httpApiId: string;
  lambdaArn: string;
  websocketApiId: string;
}): Promise<CreateStackInput> {
  const manifest = await loadManifest(buildDir);

  const [region, accountId, lambdaName] = lambdaArn
    .match(/^arn:aws:lambda:(.*):(.*):function:(.+)/)!
    .slice(1);
  invariant(accountId && region && lambdaName);
  const stackName = lambdaName;
  const lambdaCurrentArn = lambdaArn + ":current";

  const resources = [
    getPolicy({ accountId, lambdaName, region, websocketApiId }),
    getHTTPGateway({ accountId, httpApiId, lambdaArn, region }),
    getWebsocketGateway({ accountId, lambdaArn, region, websocketApiId }),
    getTables({ lambdaName }),
    ...getQueues({
      accountId,
      lambdaCurrentArn,
      lambdaName,
      queues: [...manifest.queues.values()],
      region,
    }),
    ...getSchedules({
      accountId,
      lambdaCurrentArn,
      lambdaName,
      region,
      schedules: [...manifest.schedules.values()],
    }),
  ].reduce((all, set) => ({ ...all, ...set }), {});

  // @ts-ignore
  const template = cloudform.default({
    AWSTemplateFormatVersion: "2010-09-09",
    Description: description,
    Resources: resources,
  });

  await writeFile(path.join(buildDir, cloudFormationFilename), template);

  return {
    Capabilities: ["CAPABILITY_NAMED_IAM"],
    StackName: stackName,
    TemplateBody: template,
    EnableTerminationProtection: true,
  };
}

function getPolicy({
  accountId,
  lambdaName,
  region,
  websocketApiId,
}: {
  accountId: string;
  lambdaName: string;
  region: string;
  websocketApiId: string;
}): {
  [key: string]: ResourceBase;
} {
  return {
    policy: new IAM.Policy({
      PolicyDocument: {
        Version: "2012-10-17",
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
            Resource: `arn:aws:sqs:${region}:${accountId}:${lambdaName}__*`,
          },
          {
            Effect: "Allow",
            Action: ["execute-api:ManageConnections", "execute-api:Invoke"],
            Resource: `arn:aws:execute-api:${region}:${accountId}:${websocketApiId}/${wsStage}/*`,
          },
          {
            Effect: "Allow",
            Action: [
              "dynamodb:DeleteItem",
              "dynamodb:BatchGetItem",
              "dynamodb:GetItem",
              "dynamodb:PutItem",
              "dynamodb:UpdateItem",
            ],
            Resource: `arn:aws:dynamodb:${region}:${accountId}:table/${lambdaName}-*`,
          },
          {
            Effect: "Allow",
            Action: "logs:CreateLogGroup",
            Resource: `arn:aws:logs:${region}:${accountId}:/aws/lambda/${lambdaName}`,
          },
          {
            Effect: "Allow",
            Action: ["logs:CreateLogStream", "logs:PutLogEvents"],
            Resource: `arn:aws:logs:${region}:${accountId}:log-group:/aws/lambda/${lambdaName}:*`,
          },
        ],
      },
      PolicyName: "queue-run",
      Roles: [lambdaName],
    }),
  };
}

function getHTTPGateway({
  accountId,
  httpApiId,
  lambdaArn,
  region,
}: {
  accountId: string;
  httpApiId: string;
  lambdaArn: string;
  region: string;
}): {
  [key: string]: ResourceBase;
} {
  const RefHttpIntegration = Fn.Join("/", [
    "integrations",
    Fn.Ref("httpIntegration"),
  ]);
  const RefLambdaUrl = `arn:aws:apigateway:${region}:lambda:path/2015-03-31/functions/${lambdaArn}/invocations`;

  return {
    httpIntegration: new ApiGatewayV2.Integration({
      ApiId: httpApiId,
      IntegrationType: "AWS_PROXY",
      IntegrationUri: RefLambdaUrl,
      PayloadFormatVersion: "2.0",
      TimeoutInMillis: 30000,
    }),
    httpRoute: new ApiGatewayV2.Route({
      ApiId: httpApiId,
      RouteKey: "ANY /{proxy+}",
      Target: RefHttpIntegration,
    }),
    httpStage: new ApiGatewayV2.Stage({
      ApiId: httpApiId,
      StageName: httpStage,
      AutoDeploy: true,
    }).dependsOn(["httpRoute", "policy"]),

    gatewayInvoke: new Lambda.Permission({
      Action: "lambda:InvokeFunction",
      FunctionName: lambdaArn,
      Principal: "apigateway.amazonaws.com",
      SourceArn: `arn:aws:execute-api:${region}:${accountId}:${httpApiId}/*/*/{proxy+}`,
    }),
  };
}

function getWebsocketGateway({
  accountId,
  lambdaArn,
  region,
  websocketApiId,
}: {
  accountId: string;
  lambdaArn: string;
  region: string;
  websocketApiId: string;
}): {
  [key: string]: ResourceBase;
} {
  const RefWebsocketIntegration = Fn.Join("/", [
    "integrations",
    Fn.Ref("websocketIntegration"),
  ]);
  const RefLambdaUrl = `arn:aws:apigateway:${region}:lambda:path/2015-03-31/functions/${lambdaArn}/invocations`;

  return {
    websocketIntegration: new ApiGatewayV2.Integration({
      ApiId: websocketApiId,
      ContentHandlingStrategy: "CONVERT_TO_TEXT",
      IntegrationMethod: "POST",
      IntegrationType: "AWS_PROXY",
      IntegrationUri: RefLambdaUrl,
      PassthroughBehavior: "WHEN_NO_MATCH",
      TimeoutInMillis: 29000,
    }),
    websocketConnect: new ApiGatewayV2.Route({
      ApiId: websocketApiId,
      AuthorizationType: "NONE",
      RouteKey: "$connect",
      Target: RefWebsocketIntegration,
    }),
    websocketDisconnect: new ApiGatewayV2.Route({
      ApiId: websocketApiId,
      RouteKey: "$disconnect",
      Target: RefWebsocketIntegration,
    }),
    websocketDefault: new ApiGatewayV2.Route({
      ApiId: websocketApiId,
      RouteKey: "$default",
      Target: RefWebsocketIntegration,
    }),
    websocketStage: new ApiGatewayV2.Stage({
      ApiId: websocketApiId,
      AutoDeploy: true,
      StageName: wsStage,
    }).dependsOn([
      "websocketConnect",
      "websocketDisconnect",
      "websocketDefault",
      "policy",
    ]),

    websocketPermission: new Lambda.Permission({
      Action: "lambda:InvokeFunction",
      FunctionName: lambdaArn,
      Principal: "apigateway.amazonaws.com",
      SourceArn: `arn:aws:execute-api:${region}:${accountId}:${websocketApiId}/*`,
    }),
  };
}

function getTables({ lambdaName }: { lambdaName: string }): {
  [key: string]: ResourceBase;
} {
  return {
    connectionsTable: new DynamoDB.Table({
      TableName: `${lambdaName}-connections`,
      AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
      BillingMode: "PAY_PER_REQUEST",
    }),
    userConnectionsTable: new DynamoDB.Table({
      TableName: `${lambdaName}-user-connections`,
      AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
      BillingMode: "PAY_PER_REQUEST",
    }),
  };
}

function getQueues({
  accountId,
  lambdaCurrentArn,
  lambdaName,
  queues,
  region,
}: {
  accountId: string;
  lambdaCurrentArn: string;
  lambdaName: string;
  queues: Manifest["queues"];
  region: string;
}): { [key: string]: ResourceBase }[] {
  return queues.map((queue, index) => {
    const resourceId = `sqsQueue${index}`;
    const queueName = `${lambdaName}__${queue.queueName}`;
    return {
      [resourceId]: new SQS.Queue({
        QueueName: queueName,
        ...(queue.isFifo
          ? {
              ContentBasedDeduplication: true,
              DeduplicationScope: "messageGroup",
              FifoQueue: true,
              FifoThroughputLimit: "perMessageGroupId",
            }
          : undefined),
        VisibilityTimeout: queue.timeout * 6,
      }).dependsOn("policy"),

      [`sqsSource${index}`]: new Lambda.EventSourceMapping({
        Enabled: true,
        EventSourceArn: `arn:aws:sqs:${region}:${accountId}:${queueName}`,
        FunctionName: lambdaCurrentArn,
        FunctionResponseTypes: ["ReportBatchItemFailures"],
      }).dependsOn(resourceId),
    };
  });
}

function getSchedules({
  accountId,
  lambdaCurrentArn,
  lambdaName,
  region,
  schedules,
}: {
  accountId: string;
  lambdaCurrentArn: string;
  lambdaName: string;
  region: string;
  schedules: Manifest["schedules"];
}): { [key: string]: ResourceBase }[] {
  return schedules.map((schedule, index) => {
    if (schedule.cron === null) return {};
    const ruleName = `${lambdaName}.${schedule.name}`;
    return {
      [`cloudwatchSchedule${index}`]: new Events.Rule({
        Name: ruleName,
        ScheduleExpression: `cron(${toCloudWatchCronExpression(
          schedule.cron
        )})`,
        State: "ENABLED",
        Targets: [{ Id: "lambda", Arn: lambdaCurrentArn }],
      }).dependsOn("policy"),

      [`cloudwatchPermission${index}`]: new Lambda.Permission({
        FunctionName: lambdaCurrentArn,
        Action: "lambda:InvokeFunction",
        Principal: "events.amazonaws.com",
        SourceArn: `arn:aws:events:${region}:${accountId}:rule/${ruleName}`,
      }),
    };
  });
}

// cron is typically second, minute … day of week
// AWS cron is minute, hour … year
function toCloudWatchCronExpression(cron: string) {
  const parsed = cronParser.parseExpression(cron, { iterator: false });
  // Drop seconds
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parsed
    .stringify(false)
    .split(" ");

  return [
    minute,
    hour,
    dayOfMonth === "*" ? "?" : dayOfMonth,
    month,
    dayOfWeek === "0" ? "7" : dayOfWeek, // cron accepts 0-6, AWS wants 1-7
    "*", // any year (we don't support this)
  ].join(" ");
}

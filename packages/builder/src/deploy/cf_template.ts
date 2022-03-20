/* eslint-disable sonarjs/no-duplicate-string */
import cloudform, { ApiGatewayV2, Events, Fn, Lambda, SQS } from "cloudform";
import { DynamoDB, IAM, ResourceBase, StringParameter } from "cloudform-types";
import cronParser from "cron-parser";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { loadManifest, Manifest } from "queue-run";
import { httpStage, wsStage } from "../constants.js";

const RefHttpApiId = Fn.Ref("httpApiId");
const RefLambdaArn = Fn.Ref("lambdaArn");
const RefLambdaCurrentArn = Fn.Ref("lambdaCurrentArn");
const RefLambdaName = Fn.Ref("lambdaName");
const RefWebsocketApiId = Fn.Ref("websocketApiId");

export async function cfTemplate(buildDir: string) {
  const manifest = await loadManifest(buildDir);
  const resources = [
    getPolicy(),
    getHTTPGateway(),
    getWebsocketGateway(),
    getTables(),
    ...getQueues(...manifest.queues.values()),
    ...getSchedules(...manifest.schedules.values()),
  ].reduce((all, set) => ({ ...all, ...set }), {});
  // @ts-ignore
  const stack = cloudform.default({
    AWSTemplateFormatVersion: "2010-09-09",
    Parameters: {
      httpApiId: new StringParameter(),
      lambdaArn: new StringParameter(),
      lambdaCurrentArn: new StringParameter(),
      lambdaName: new StringParameter(),
      websocketApiId: new StringParameter(),
    },
    Resources: resources,
  });
  await writeFile(path.join(buildDir, "cfn.json"), stack);
}

function getPolicy(): { [key: string]: ResourceBase } {
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
            Resource: Fn.Join(":", [
              "arn:aws:sqs",
              Fn.Ref("AWS::Region"),
              Fn.Ref("AWS::AccountId"),
              Fn.Join("__", [RefLambdaName, "*"]),
            ]),
          },
          {
            Effect: "Allow",
            Action: ["execute-api:ManageConnections", "execute-api:Invoke"],
            Resource: Fn.Join(":", [
              "arn:aws:execute-api",
              Fn.Ref("AWS::Region"),
              Fn.Ref("AWS::AccountId"),
              Fn.Join("/", [RefWebsocketApiId, wsStage, "*"]),
            ]),
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
            Resource: Fn.Join(":", [
              "arn:aws:dynamodb",
              Fn.Ref("AWS::Region"),
              Fn.Ref("AWS::AccountId"),
              Fn.Join("/", ["table", Fn.Join("-", [RefLambdaName, "*"])]),
            ]),
          },
          {
            Effect: "Allow",
            Action: "logs:CreateLogGroup",
            Resource: Fn.Join(":", [
              "arn:aws:logs",
              Fn.Ref("AWS::Region"),
              Fn.Ref("AWS::AccountId"),
              Fn.Join("/", ["/aws/lambda", RefLambdaName]),
            ]),
          },
          {
            Effect: "Allow",
            Action: ["logs:CreateLogStream", "logs:PutLogEvents"],
            Resource: Fn.Join(":", [
              "arn:aws:logs",
              Fn.Ref("AWS::Region"),
              Fn.Ref("AWS::AccountId"),
              "log-group",
              Fn.Join("/", ["/aws/lambda", RefLambdaName]),
              "*",
            ]),
          },
        ],
      },
      PolicyName: "queue-run",
      Roles: [RefLambdaName],
    }),
  };
}

const RefLambdaUrl = Fn.Join(":", [
  "arn:aws:apigateway",
  Fn.Ref("AWS::Region"),
  "lambda",
  Fn.Join("/", ["path/2015-03-31/functions", RefLambdaArn, "invocations"]),
]);

function getHTTPGateway(): { [key: string]: ResourceBase } {
  return {
    httpIntegration: new ApiGatewayV2.Integration({
      ApiId: RefHttpApiId,
      IntegrationType: "AWS_PROXY",
      IntegrationUri: RefLambdaUrl,
      PayloadFormatVersion: "2.0",
      TimeoutInMillis: 30000,
    }),
    httpRoute: new ApiGatewayV2.Route({
      ApiId: RefHttpApiId,
      RouteKey: "ANY /{proxy+}",
      Target: Fn.Join("/", ["integrations", Fn.Ref("httpIntegration")]),
    }),
    httpStage: new ApiGatewayV2.Stage({
      ApiId: RefHttpApiId,
      StageName: httpStage,
      AutoDeploy: true,
    }).dependsOn(["httpRoute", "policy"]),

    gatewayInvoke: new Lambda.Permission({
      Action: "lambda:InvokeFunction",
      FunctionName: RefLambdaArn,
      Principal: "apigateway.amazonaws.com",
      SourceArn: Fn.Join(":", [
        "arn:aws:execute-api",
        Fn.Ref("AWS::Region"),
        Fn.Ref("AWS::AccountId"),
        Fn.Join("/", [RefHttpApiId, "*/*/{proxy+}"]),
      ]),
    }),
  };
}

function getWebsocketGateway(): { [key: string]: ResourceBase } {
  const RefIntegration = Fn.Join("/", [
    "integrations",
    Fn.Ref("websocketIntegration"),
  ]);

  return {
    websocketIntegration: new ApiGatewayV2.Integration({
      ApiId: RefWebsocketApiId,
      ContentHandlingStrategy: "CONVERT_TO_TEXT",
      IntegrationMethod: "POST",
      IntegrationType: "AWS_PROXY",
      IntegrationUri: RefLambdaUrl,
      PassthroughBehavior: "WHEN_NO_MATCH",
      TimeoutInMillis: 29000,
    }),
    websocketConnect: new ApiGatewayV2.Route({
      ApiId: RefWebsocketApiId,
      AuthorizationType: "NONE",
      RouteKey: "$connect",
      Target: RefIntegration,
    }),
    websocketDisconnect: new ApiGatewayV2.Route({
      ApiId: RefWebsocketApiId,
      RouteKey: "$disconnect",
      Target: RefIntegration,
    }),
    websocketDefault: new ApiGatewayV2.Route({
      ApiId: RefWebsocketApiId,
      RouteKey: "$default",
      Target: RefIntegration,
    }),
    websocketStage: new ApiGatewayV2.Stage({
      ApiId: RefWebsocketApiId,
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
      FunctionName: RefLambdaArn,
      Principal: "apigateway.amazonaws.com",
      SourceArn: Fn.Join(":", [
        "arn:aws:execute-api",
        Fn.Ref("AWS::Region"),
        Fn.Ref("AWS::AccountId"),
        Fn.Join("/", [RefWebsocketApiId, "*"]),
      ]),
    }),
  };
}

function getTables(): { [key: string]: ResourceBase } {
  return {
    connectionsTable: new DynamoDB.Table({
      TableName: Fn.Join("-", [RefLambdaName, "connections"]),
      AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
      BillingMode: "PAY_PER_REQUEST",
    }),
    userConnectionsTable: new DynamoDB.Table({
      TableName: Fn.Join("-", [RefLambdaName, "user-connections"]),
      AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
      BillingMode: "PAY_PER_REQUEST",
    }),
  };
}

function getQueues(
  ...queues: Manifest["queues"]
): { [key: string]: ResourceBase }[] {
  return queues.map((queue, index) => {
    const resourceId = `sqsQueue${index}`;
    const queueName = Fn.Join("__", [RefLambdaName, queue.queueName]);
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
        EventSourceArn: Fn.Join(":", [
          "arn:aws:sqs",
          Fn.Ref("AWS::Region"),
          Fn.Ref("AWS::AccountId"),
          queueName,
        ]),
        FunctionName: RefLambdaCurrentArn,
        FunctionResponseTypes: ["ReportBatchItemFailures"],
      }).dependsOn(resourceId),
    };
  });
}

function getSchedules(
  ...schedules: Manifest["schedules"]
): { [key: string]: ResourceBase }[] {
  return schedules.map((schedule, index) => {
    if (schedule.cron === null) return {};
    const ruleName = Fn.Join(".", [RefLambdaName, schedule.name]);
    return {
      [`cloudwatchSchedule${index}`]: new Events.Rule({
        Name: ruleName,
        ScheduleExpression: `cron(${toCloudWatchCronExpression(
          schedule.cron
        )})`,
        State: "ENABLED",
        Targets: [{ Id: "lambda", Arn: RefLambdaCurrentArn }],
      }).dependsOn("policy"),

      [`cloudwatchPermission${index}`]: new Lambda.Permission({
        FunctionName: RefLambdaCurrentArn,
        Action: "lambda:InvokeFunction",
        Principal: "events.amazonaws.com",
        SourceArn: Fn.Join(":", [
          "arn:aws:events",
          Fn.Ref("AWS::Region"),
          Fn.Ref("AWS::AccountId"),
          Fn.Join("/", ["rule", ruleName]),
        ]),
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

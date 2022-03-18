/* eslint-disable sonarjs/no-duplicate-string */
import { ProtocolType } from "@aws-sdk/client-apigatewayv2";
import cloudform, {
  ApiGatewayV2,
  Events,
  Fn,
  IAM,
  Lambda,
  Logs,
  SQS,
} from "cloudform";
import { DeletionPolicy, ResourceBase, StringParameter } from "cloudform-types";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { loadManifest, Manifest } from "queue-run";
import { toCloudWatchCronExpression } from "./schedules.js";

const httpStage = "$default";
const lambdaRolePath = "/queue-run/projects/";
const wsStage = "_ws";
const RefLambdaArn = Fn.Ref("LambdaArn");

export async function cfTemplate({
  buildDir,
  lambdaName,
}: {
  buildDir: string;
  lambdaName: string;
}) {
  const manifest = await loadManifest(buildDir);
  const resources = [
    getRole(lambdaName),
    getLogs(lambdaName),
    getAPIGatewate(lambdaName),
    ...getQueues(lambdaName, [...manifest.queues.values()]),
    ...getSchedules(lambdaName, [...manifest.schedules.values()]),
  ].reduce((all, set) => ({ ...all, ...set }), {});
  // @ts-ignore
  const stack = cloudform.default({
    AWSTemplateFormatVersion: "2010-09-09",
    Description: `Stack for ${lambdaName}`,
    Parameters: {
      LambdaArn: new StringParameter({
        Description: "Lambda function ARN",
      }),
      LambdaName: new StringParameter({ Default: lambdaName }),
    },
    Resources: resources,
  });
  await writeFile(path.join(buildDir, "cfn.json"), stack);
}

function getAPIGatewate(lambdaName: string) {
  return {
    ...getHTTPGateway(lambdaName),
    ...getWebsocketGateway(lambdaName),
    gatewayInvoke: new Lambda.Permission({
      Action: "lambda:InvokeFunction",
      FunctionName: lambdaName,
      Principal: "apigateway.amazonaws.com",
    }),
  };
}

function getHTTPGateway(lambdaName: string) {
  const RefApiId = Fn.Ref("httpApi");
  return {
    httpApi: new ApiGatewayV2.Api({
      Description: `QueueRun API gateway for project ${lambdaName}`,
      Name: `qr-http-${lambdaName}`,
      ProtocolType: "HTTP",
    }).deletionPolicy(DeletionPolicy.Delete),
    httpIntegration: new ApiGatewayV2.Integration({
      ApiId: RefApiId,
      IntegrationType: "AWS_PROXY",
      IntegrationUri: RefLambdaArn,
      PayloadFormatVersion: "2.0",
      TimeoutInMillis: 30000,
    }).dependsOn("httpApi"),
    httpRoute: new ApiGatewayV2.Route({
      ApiId: RefApiId,
      RouteKey: "ANY /{proxy+}",
      Target: Fn.Join("/", ["integrations", Fn.Ref("httpIntegration")]),
    }).dependsOn("httpIntegration"),
    httpDeployment: new ApiGatewayV2.Deployment({
      ApiId: RefApiId,
    }).dependsOn("httpIntegration"),
    httpStage: new ApiGatewayV2.Stage({
      ApiId: RefApiId,
      DeploymentId: Fn.Ref("httpDeployment"),
      StageName: httpStage,
    }).dependsOn("httpDeployment"),
  };
}

function getWebsocketGateway(lambdaName: string) {
  const RefApiId = Fn.Ref("websocketApi");
  const RefIntegration = Fn.Join("/", [
    "integrations",
    Fn.Ref("websocketIntegration"),
  ]);

  return {
    websocketApi: new ApiGatewayV2.Api({
      Name: `qr-ws-${lambdaName}`,
      ProtocolType: ProtocolType.WEBSOCKET,
      RouteSelectionExpression: "*",
    }).deletionPolicy(DeletionPolicy.Delete),
    websocketIntegration: new ApiGatewayV2.Integration({
      ApiId: RefApiId,
      ContentHandlingStrategy: "CONVERT_TO_TEXT",
      IntegrationMethod: "POST",
      IntegrationType: "AWS_PROXY",
      IntegrationUri: Fn.Join("/", [
        "arn:aws:apigateway:us-east-1:lambda:path/2015-03-31/functions",
        RefLambdaArn,
        "invocations",
      ]),
      PassthroughBehavior: "WHEN_NO_MATCH",
      TimeoutInMillis: 29000,
    }).dependsOn("websocketApi"),
    websocketConnect: new ApiGatewayV2.Route({
      ApiId: RefApiId,
      AuthorizationType: "NONE",
      RouteKey: "$connect",
      Target: RefIntegration,
    }).dependsOn("websocketIntegration"),
    websocketDisconnect: new ApiGatewayV2.Route({
      ApiId: RefApiId,
      RouteKey: "$disconnect",
      Target: RefIntegration,
    }).dependsOn("websocketIntegration"),
    websocketDefault: new ApiGatewayV2.Route({
      ApiId: RefApiId,
      RouteKey: "$default",
      Target: RefIntegration,
    }).dependsOn("websocketIntegration"),
    websocketDeployment: new ApiGatewayV2.Deployment({
      ApiId: RefApiId,
    }).dependsOn("websocketIntegration"),
    websocketStage: new ApiGatewayV2.Stage({
      ApiId: RefApiId,
      DeploymentId: Fn.Ref("websocketDeployment"),
      StageName: wsStage,
    }).dependsOn("websocketDeployment"),
  };
}

function getLogs(lambdaName: string) {
  const logGroupName = `/aws/lambda/${lambdaName}`;
  return {
    logsGroup: new Logs.LogGroup({ LogGroupName: logGroupName }).deletionPolicy(
      DeletionPolicy.Retain
    ),
  };
}

function getRole(lambdaName: string) {
  return {
    lambdaRole: new IAM.Role({
      Path: lambdaRolePath,
      RoleName: lambdaName,
      AssumeRolePolicyDocument: assumeRolePolicy,
      Policies: [{ PolicyName: "queue-run", PolicyDocument: lambdaPolicy }],
    }).deletionPolicy(DeletionPolicy.Delete),
  };
}

function getQueues(
  lambdaName: string,
  queues: Manifest["queues"]
): {
  [key: string]: ResourceBase;
}[] {
  return queues.map((queue, index) => {
    const { queueName } = queue;
    const queueId = `sqsQueue${index}`;
    return {
      [queueId]: new SQS.Queue({
        QueueName: `${lambdaName}__${queueName}`,
        ...(queue.isFifo
          ? {
              ContentBasedDeduplication: true,
              DeduplicationScope: "messageGroup",
              FifoQueue: true,
              FifoThroughputLimit: "perMessageGroupId",
            }
          : undefined),
        VisibilityTimeout: queue.timeout * 6,
      }).deletionPolicy(DeletionPolicy.Delete),

      [`sqsSource${index}`]: new Lambda.EventSourceMapping({
        Enabled: true,
        EventSourceArn: Fn.Ref(queueId),
        FunctionName: RefLambdaArn,
        FunctionResponseTypes: ["ReportBatchItemFailures"],
      }).dependsOn(queueId),
    };
  });
}

function getSchedules(lambdaName: string, schedules: Manifest["schedules"]) {
  return schedules.map((schedule, index) => {
    if (schedule.cron === null) return {};
    const ruleId = `cloudwatchSchedule${index}`;
    return {
      [ruleId]: new Events.Rule({
        Name: `${lambdaName}.${schedule.name}`,
        ScheduleExpression: `cron(${toCloudWatchCronExpression(
          schedule.cron
        )})`,
        State: "ENABLED",
        Targets: [{ Id: "lambda", Arn: RefLambdaArn }],
      }).deletionPolicy(DeletionPolicy.Delete),

      [`cloudwatchPermission${index}`]: new Lambda.Permission({
        FunctionName: lambdaName,
        Action: "lambda:InvokeFunction",
        Principal: "events.amazonaws.com",
        SourceArn: Fn.Ref(ruleId),
      }),
    };
  });
}

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

const RefRegion = Fn.Ref("AWS::Region");
const RefAccountId = Fn.Ref("AWS::AccountId");
const RefLambdaName = Fn.Ref("LambdaName");
const RefLogGroup = Fn.Join("", ["/aws/lambda/", RefLambdaName]);

const lambdaPolicy = {
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
        RefRegion,
        RefAccountId,
        Fn.Join("__", [RefLambdaName, "*"]),
      ]),
    },
    {
      Effect: "Allow",
      Action: ["execute-api:ManageConnections", "execute-api:Invoke"],
      Resource: [
        Fn.Join(":", [
          "arn:aws:execute-api",
          RefRegion,
          RefAccountId,
          Fn.Join("", [Fn.Ref("websocketApi"), "/_ws/*"]),
        ]),
      ],
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
      Resource: [
        Fn.Join(":", [
          "arn:aws:dynamodb",
          RefRegion,
          RefAccountId,
          "table/qr-connections",
        ]),
        Fn.Join(":", [
          "arn:aws:dynamodb",
          RefRegion,
          RefAccountId,
          "table/qr-user-connections",
        ]),
      ],
    },
    {
      Effect: "Allow",
      Action: "logs:CreateLogGroup",
      Resource: Fn.Join(":", [
        "arn:aws:logs",
        RefRegion,
        RefAccountId,
        RefLogGroup,
      ]),
    },
    {
      Effect: "Allow",
      Action: ["logs:CreateLogStream", "logs:PutLogEvents"],
      Resource: [
        Fn.Join(":", [
          "arn:aws:logs",
          RefRegion,
          RefAccountId,
          "log-group",
          RefLogGroup,
          "*",
        ]),
      ],
    },
  ],
};

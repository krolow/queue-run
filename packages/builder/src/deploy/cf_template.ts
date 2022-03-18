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
    Description: `Stack for ${lambdaName}`,
    Parameters: {
      LambdaArn: new StringParameter({
        Description: "Lambda function ARN",
      }),
    },
    Resources: resources,
  });
  await writeFile(path.join(buildDir, "cfn.json"), stack);
}

function getAPIGatewate(lambdaName: string) {
  return {
    ...getHTTPGateway(lambdaName),
    ...getWebsocketGateway(lambdaName),
    "lambda.invoke": new Lambda.Permission({
      Action: "lambda:InvokeFunction",
      FunctionName: lambdaName,
      Principal: "apigateway.amazonaws.com",
    }).dependsOn("lambda.function"),
  };
}

function getHTTPGateway(lambdaName: string) {
  const RefApiId = Fn.GetAtt("gateway.http.api", "ApiId");
  return {
    "gateway.http.api": new ApiGatewayV2.Api({
      Description: `QueueRun API gateway for project ${lambdaName}`,
      Name: `qr-http-${lambdaName}`,
      ProtocolType: "HTTP",
    }).deletionPolicy(DeletionPolicy.Delete),
    "gateway.http.integration": new ApiGatewayV2.Integration({
      ApiId: RefApiId,
      IntegrationType: "AWS_PROXY",
      IntegrationUri: RefLambdaArn,
      PayloadFormatVersion: "2.0",
      TimeoutInMillis: 30000,
    }).dependsOn(["gateway.http.api", "lambda.function"]),
    "gateway.http.route": new ApiGatewayV2.Route({
      ApiId: RefApiId,
      RouteKey: "ANY /{proxy+}",
      Target: Fn.Join("/", [
        "integrations",
        Fn.GetAtt("gateway.http.integration", "IntegrationId"),
      ]),
    }).dependsOn("gateway.http.integration"),
    "gateway.http.deployment": new ApiGatewayV2.Deployment({
      ApiId: RefApiId,
    }).dependsOn("gateway.http.integration"),
    "gateway.http.stage": new ApiGatewayV2.Stage({
      ApiId: RefApiId,
      DeploymentId: Fn.GetAtt("gateway.http.deployment", "DeploymentId"),
      StageName: httpStage,
    }).dependsOn("gateway.http.deployment"),
  };
}

function getWebsocketGateway(lambdaName: string) {
  const RefApiId = Fn.GetAtt("gateway.websockt.api", "ApiId");
  const RefIntegration = Fn.Join("/", [
    "integrations",
    Fn.GetAtt("gateway.websocket.integration", "IntegrationId"),
  ]);

  return {
    "gateway.websocket": new ApiGatewayV2.Api({
      Name: `qr-ws-${lambdaName}`,
      ProtocolType: ProtocolType.WEBSOCKET,
      RouteSelectionExpression: "*",
    }).deletionPolicy(DeletionPolicy.Delete),
    "gateway.websockt.integration": new ApiGatewayV2.Integration({
      ApiId: RefApiId,
      ContentHandlingStrategy: "CONVERT_TO_TEXT",
      IntegrationMethod: "POST",
      IntegrationType: "AWS_PROXY",
      IntegrationUri: Fn.Join("/", [
        "arn:aws:apigateway:us-east-1:lambda:path/2015-03-31/functions",
        RefLambdaArn,
        "nvocations",
      ]),
      PassthroughBehavior: "WHEN_NO_MATCH",
      TimeoutInMillis: 29000,
    }).dependsOn(["gateway.websocket.api", "lambda.function"]),
    "gateway.websocket.connect": new ApiGatewayV2.Route({
      ApiId: RefApiId,
      AuthorizationType: "NONE",
      RouteKey: "$connect",
      Target: RefIntegration,
    }).dependsOn("gateway.wesocket.integration"),
    "gateway.websocket.disconnect": new ApiGatewayV2.Route({
      ApiId: RefApiId,
      RouteKey: "$disconnect",
      Target: RefIntegration,
    }).dependsOn("gateway.wesocket.integration"),
    "gateway.websocket.default": new ApiGatewayV2.Route({
      ApiId: RefApiId,
      RouteKey: "$default",
      Target: RefIntegration,
    }).dependsOn("gateway.wesocket.integration"),
    "gateway.websocket.deployment": new ApiGatewayV2.Deployment({
      ApiId: RefApiId,
    }).dependsOn("gateway.wesocket.integration"),
    "gateway.websocket.stage": new ApiGatewayV2.Stage({
      ApiId: RefApiId,
      DeploymentId: Fn.GetAtt("gateway.websocket.deployment", "DeploymentId"),
      StageName: wsStage,
    }).dependsOn("gateway.wesocket.deployment"),
  };
}

function getLogs(lambdaName: string) {
  const logGroupName = `/aws/lambda/${lambdaName}`;
  return {
    "logs.group": new Logs.LogGroup({ LogGroupName: logGroupName }),
  };
}

function getRole(lambdaName: string) {
  return {
    "lambda.role": new IAM.Role({
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
  return queues.map((queue) => {
    const { queueName } = queue;
    const queueId = `sqs.${queueName}.queue`;
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
      }),
      [`sqs.${queueName}.source`]: new Lambda.EventSourceMapping({
        Enabled: true,
        EventSourceArn: Fn.GetAtt(queueId, "Arn"),
        FunctionName: RefLambdaArn,
        FunctionResponseTypes: ["ReportBatchItemFailures"],
      }).dependsOn([queueId, "lambda.function"]),
    };
  });
}

function getSchedules(lambdaName: string, schedules: Manifest["schedules"]) {
  return schedules.map((schedule) => {
    if (schedule.cron === null) return {};
    const ruleId = `cloudwatch.schedule.${schedule.name}.rule`;
    return {
      [ruleId]: new Events.Rule({
        Name: `${lambdaName}.${schedule.name}`,
        ScheduleExpression: `cron(${toCloudWatchCronExpression(
          schedule.cron
        )})`,
        State: "ENABLED",
        Targets: [{ Id: "lambda", Arn: RefLambdaArn }],
      }),

      [`cloudwatch.schedule.${schedule.name}.premission`]:
        new Lambda.Permission({
          FunctionName: lambdaName,
          Action: "lambda:InvokeFunction",
          Principal: "events.amazonaws.com",
          SourceArn: Fn.GetAtt(ruleId, "Arn"),
        }).dependsOn([ruleId, "lambda.function"]),
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
const RefFunctionName = Fn.GetAtt("lambda.function", "FunctionName");
const RefLogGroup = Fn.Join("", ["/aws/lambda/", RefFunctionName]);

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
        Fn.Join("__", [RefFunctionName, "*"]),
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
          Fn.Join("", [Fn.GetAtt("api.ws", "ApiId"), "/_ws/*"]),
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

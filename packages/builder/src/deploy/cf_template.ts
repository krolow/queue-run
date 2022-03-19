/* eslint-disable sonarjs/no-duplicate-string */
import cloudform, { ApiGatewayV2, Events, Fn, Lambda, SQS } from "cloudform";
import { ResourceBase, StringParameter } from "cloudform-types";
import cronParser from "cron-parser";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { debuglog } from "node:util";
import { loadManifest, Manifest } from "queue-run";

const httpStage = "$default";
const wsStage = "_ws";
const RefLambdaArn = Fn.Ref("lambdaArn");
const RefLambdaName = Fn.Ref("lambdaName");
const debug = debuglog("queue-run:build");

export async function cfTemplate(buildDir: string) {
  const manifest = await loadManifest(buildDir);
  const resources = [
    getHTTPGateway(),
    getWebsocketGateway(),
    ...getQueues(...manifest.queues.values()),
    ...getSchedules(...manifest.schedules.values()),
  ].reduce((all, set) => ({ ...all, ...set }), {});
  // @ts-ignore
  const stack = cloudform.default({
    AWSTemplateFormatVersion: "2010-09-09",
    Parameters: {
      httpApiId: new StringParameter(),
      lambdaArn: new StringParameter(),
      lambdaName: new StringParameter(),
      websocketApiId: new StringParameter(),
    },
    Resources: resources,
  });
  await writeFile(path.join(buildDir, "cfn.json"), stack);
}

function getHTTPGateway(): { [key: string]: ResourceBase } {
  const RefApiId = Fn.Ref("httpApiId");
  return {
    httpIntegration: new ApiGatewayV2.Integration({
      ApiId: RefApiId,
      IntegrationType: "AWS_PROXY",
      IntegrationUri: RefLambdaArn,
      PayloadFormatVersion: "2.0",
      TimeoutInMillis: 30000,
    }),
    httpRoute: new ApiGatewayV2.Route({
      ApiId: RefApiId,
      RouteKey: "ANY /{proxy+}",
      Target: Fn.Join("/", ["integrations", Fn.Ref("httpIntegration")]),
    }).dependsOn("httpIntegration"),
    httpDeployment: new ApiGatewayV2.Deployment({
      ApiId: RefApiId,
    }).dependsOn("httpRoute"),
    httpStage: new ApiGatewayV2.Stage({
      ApiId: RefApiId,
      DeploymentId: Fn.Ref("httpDeployment"),
      StageName: httpStage,
    }).dependsOn("httpDeployment"),

    gatewayInvoke: new Lambda.Permission({
      Action: "lambda:InvokeFunction",
      FunctionName: RefLambdaName,
      Principal: "apigateway.amazonaws.com",
    }),
  };
}

function getWebsocketGateway(): { [key: string]: ResourceBase } {
  const RefApiId = Fn.Ref("websocketApiId");
  const RefIntegration = Fn.Join("/", [
    "integrations",
    Fn.Ref("websocketIntegration"),
  ]);

  return {
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
    }),
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
    }).dependsOn([
      "websocketConnect",
      "websocketDisconnect",
      "websocketDefault",
    ]),
    websocketStage: new ApiGatewayV2.Stage({
      ApiId: RefApiId,
      DeploymentId: Fn.Ref("websocketDeployment"),
      StageName: wsStage,
    }).dependsOn("websocketDeployment"),
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
      }),

      [`sqsSource${index}`]: new Lambda.EventSourceMapping({
        Enabled: true,
        EventSourceArn: Fn.Join(":", [
          "arn:aws:sqs",
          Fn.Ref("AWS::Region"),
          Fn.Ref("AWS::AccountId"),
          queueName,
        ]),
        FunctionName: RefLambdaArn,
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
    const resourceId = `cloudwatchSchedule${index}`;
    const ruleName = Fn.Join(".", [RefLambdaName, schedule.name]);
    return {
      [resourceId]: new Events.Rule({
        Name: ruleName,
        ScheduleExpression: `cron(${toCloudWatchCronExpression(
          schedule.cron
        )})`,
        State: "ENABLED",
        Targets: [{ Id: "lambda", Arn: RefLambdaArn }],
      }),

      [`cloudwatchPermission${index}`]: new Lambda.Permission({
        FunctionName: RefLambdaArn,
        Action: "lambda:InvokeFunction",
        Principal: "events.amazonaws.com",
        SourceArn: Fn.Join(":", [
          "arn:aws:events",
          Fn.Ref("AWS::Region"),
          Fn.Ref("AWS::AccountId"),
          Fn.Join("/", ["rule", ruleName]),
        ]),
      }).dependsOn(resourceId),
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

  const expr = [
    minute,
    hour,
    dayOfMonth === "*" ? "?" : dayOfMonth,
    month,
    dayOfWeek === "0" ? "7" : dayOfWeek, // cron accepts 0-6, AWS wants 1-7
    "*", // any year (we don't support this)
  ].join(" ");
  debug("EventBridge schedule expression: %s", expr);
  return expr;
}

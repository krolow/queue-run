import { CloudWatch } from "@aws-sdk/client-cloudwatch";
import { CloudWatchEvents } from "@aws-sdk/client-cloudwatch-events";
import cronParser from "cron-parser";
import ms from "ms";

export async function listSchedules({
  lambdaArn,
  // Count invocations for this time period (ms)
  range = ms("30d"),
}: {
  lambdaArn: string;
  range?: number;
}): Promise<
  Array<{
    name: string;
    cron: string;
    nextRun: Date | undefined;
    lastRun: Date | undefined;
  }>
> {
  const region = lambdaArn.match(/arn:aws:lambda:(.*?):/)![1]!;
  const events = new CloudWatchEvents({ region });
  const ruleNames = await getRuleNames({ events, lambdaArn });

  const cloudWatch = new CloudWatch({ region });

  const rules = await Promise.all(
    ruleNames.map((ruleName) =>
      Promise.all([
        events.describeRule({ Name: ruleName }),
        getLastRun({
          cloudWatch,
          ruleName,
          range,
        }),
      ])
    )
  );

  return rules
    .filter(([rule]) => rule.State === "ENABLED")
    .map(([rule, lastRun]) => ({
      name: rule.Name!.split(".")[1]!,
      cron: toRegularCron(rule.ScheduleExpression),
      lastRun,
    }))
    .filter(({ cron }) => !!cron)
    .map(({ name, cron, lastRun }) => ({
      name,
      cron: cron!,
      nextRun: cronParser.parseExpression(cron!, { utc: true }).next().toDate(),
      lastRun,
    }));
}

async function getRuleNames({
  events,
  lambdaArn,
  nextToken,
}: {
  events: CloudWatchEvents;
  lambdaArn: string;
  nextToken?: string | undefined;
}): Promise<string[]> {
  const { RuleNames, NextToken } = await events.listRuleNamesByTarget({
    TargetArn: lambdaArn,
    ...(nextToken && { NextToken: nextToken }),
  });
  if (!RuleNames) return [];
  if (!NextToken) return RuleNames;
  const next = await getRuleNames({ events, lambdaArn, nextToken: NextToken });
  return RuleNames.concat(next);
}

async function getLastRun({
  cloudWatch,
  ruleName,
  range,
}: {
  cloudWatch: CloudWatch;
  ruleName: string;
  range: number;
}): Promise<Date | undefined> {
  const end = Date.now();
  const start = end - range;
  const period = ms("1m");

  const { MetricDataResults } = await cloudWatch.getMetricData({
    MetricDataQueries: [
      {
        MetricStat: {
          Metric: {
            MetricName: "TriggeredRules",
            Namespace: "AWS/Events",
            Dimensions: [{ Name: "RuleName", Value: ruleName }],
          },
          Period: period / 1000,
          Stat: "Average",
        },
        Id: "invocations",
      },
    ],
    EndTime: new Date(end),
    ScanBy: "TimestampDescending",
    StartTime: new Date(start),
  });
  return MetricDataResults?.[0]?.Timestamps?.[0];
}

function toRegularCron(scheduleExpression: string | undefined) {
  return scheduleExpression
    ?.match(/cron\((.*)\)/)?.[1]
    ?.replace(/\?/g, "*")
    .replace(/ \*$/g, "");
}

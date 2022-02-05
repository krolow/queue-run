import { CloudWatch } from "@aws-sdk/client-cloudwatch";
import { CloudWatchEvents } from "@aws-sdk/client-cloudwatch-events";
import { Lambda } from "@aws-sdk/client-lambda";
import cronParser from "cron-parser";
import ms from "ms";
import ora from "ora";
import { ScheduledJob } from "queue-run";

export async function updateSchedules({
  lambdaArn,
  region,
  schedules,
}: {
  lambdaArn: string;
  region: string;
  schedules: ScheduledJob[];
}) {
  const spinner = ora("Updating schedules").start();
  const events = new CloudWatchEvents({ region });
  const lambda = new Lambda({ region });
  await Promise.all(
    schedules.map((schedule) =>
      updateSchedule({
        events,
        lambda,
        lambdaArn,
        schedule,
      })
    )
  );
  spinner.succeed(`Updated ${schedules.length} schedules`);
}

async function updateSchedule({
  events,
  lambda,
  lambdaArn,
  schedule,
}: {
  events: CloudWatchEvents;
  lambda: Lambda;
  lambdaArn: string;
  schedule: ScheduledJob;
}) {
  const [region, accountId, lambdaName] = lambdaArn
    .match(/arn:aws:lambda:(.*):(.*):function:(.*):/)!
    .slice(1);
  const ruleName = `${lambdaName}.${schedule.name}`;
  await events.putRule({
    Name: ruleName,
    ScheduleExpression: `cron(${toCloudWatchCronExpression(schedule.cron)})`,
    State: "ENABLED",
  });
  await events.putTargets({
    Rule: ruleName,
    Targets: [{ Id: "lambda", Arn: lambdaArn }],
  });

  try {
    await lambda.addPermission({
      Action: "lambda:InvokeFunction",
      FunctionName: lambdaArn,
      Principal: "events.amazonaws.com",
      SourceArn: `arn:aws:events:${region}:${accountId}:rule/${ruleName}`,
      StatementId: ruleName.replace(/\./g, "__"),
    });
  } catch (error) {
    if (!(error instanceof Error && error.name === "ResourceConflictException"))
      throw error;
  }
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
    dayOfMonth,
    month,
    dayOfWeek === "*" && dayOfMonth === "*" ? "?" : dayOfWeek,
    "*",
  ].join(" ");
}

export async function removeUnusedSchedules({
  region,
  lambdaArn,
  schedules,
}: {
  lambdaArn: string;
  region: string;
  schedules: Set<string>;
}) {
  const spinner = ora("Removing old schedules").start();
  const [lambdaName] = lambdaArn.match(/([^:]+):([^:]+)$/)!.slice(1);
  const prefix = `${lambdaName}.`;
  const events = new CloudWatchEvents({ region });
  const ruleNames = await getRuleNames({ events, lambdaArn });
  const unused = ruleNames
    .filter((name) => name.startsWith(prefix))
    .filter((name) => !schedules.has(name.slice(prefix.length)));
  await Promise.all(
    unused.map(async (name) => {
      await events.removeTargets({ Ids: ["lambda"], Rule: name });
      await events.deleteRule({ Name: name });
    })
  );
  spinner.succeed(`Removed ${unused.length} old schedules`);
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

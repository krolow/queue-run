import { CloudWatchEvents } from "@aws-sdk/client-cloudwatch-events";
import { Lambda } from "@aws-sdk/client-lambda";
import cronParser from "cron-parser";
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
  let nextToken: string | undefined;
  let deleting = 0;
  do {
    const rules = await events.listRuleNamesByTarget({
      TargetArn: lambdaArn,
      ...(nextToken && { NextToken: nextToken }),
    });
    const ruleNames = rules.RuleNames ?? [];
    const unused = ruleNames
      .filter((name) => name.startsWith(prefix))
      .filter((name) => !schedules.has(name.slice(prefix.length)));
    await Promise.all(unused.map((name) => events.deleteRule({ Name: name })));
    deleting += unused.length;

    nextToken = rules.NextToken;
  } while (nextToken);
  spinner.succeed(`Removed ${deleting} old schedules`);
}

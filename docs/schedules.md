# Scheduled Jobs

Scheduled jobs allow your backend to do work on recurring schedule:

* Fetch RSS feeds every hour
* Update statistics every midnight
* Cleanup expired database records every weekend
* Send a status report every Monday and Friday morning
* Run payroll on the 1st and 15th of every month

:::info Scheduled Jobs Should Be This Easy

The general idea is that in under 2 minutes you can go from "I wrote this function" to "it now runs every morning." Or every minute, or every Monday, or every 1st day of the month.

There's no infrastructure to manage, no configuration files to tweak, it doesn't get easier than this.

QueueRun will deploy your functions and set up the schedule execution rules for you. AWS Lambda and EventBridge will make sure it runs like clockwork.

You can check on the status of your schedules — last run, next expected run — using the `status` command. Schedule runs will also show in the logs.

You can test your code locally using the `schedule` command.

You can manually run a scheduled job at any time using the same `schedule` command.

You can turn off all scheduled jobs during a maintenance window using the `reserved` command.

If your schedule does something complicated and you need to space out the workload, or automatic retries, you can combine schedules with standard and FIFO queues. All part of the same codebase.

Middleware makes it super easy to integrate with external monitoring tools like cronitor.io, healthchecks.io, Sentry, Rollbar, Logtail, etc.
:::


## The Scheduled Job Function

A scheduled job is a function that lives in the `schedules` directory.

Each file is one schedule and one function that will execute on that schedule.

The default export is the function that will be called to execute that job.

The export named `schedule` defines when the job would run.

For example, if you have a job that needs to run once a day:

```ts title=schedules/report.ts
export default async function dailyReport() {
  // generate and email the report
}

export const schedule = "daily";
```

The function is called with metadata about the job:

* `cron` — The schedule as a cron expression
* `jobId` — Unique identifier for each run
* `name` — The name of this schedule
* `signal` — The abort signal

The file can also export middleware functions (see [Monitoring](#monitoring)), and the `config` object (see [timeout](#timeout)).



## The Schedule Expression

The schedule expression determines when and how often the job runs.

You can schedule it to run every few minutes, hours, days, etc. You can also schedule it to run at a particular time every day, on specific days of the week, month, etc.

You can use [the cron expression](https://crontab.guru/) which has the form:

```
*    *    *    *    *    *
┬    ┬    ┬    ┬    ┬    ┬
│    │    │    │    │    |
│    │    │    │    │    └ day of week (0 - 7, 1L - 7L) (0 or 7 is Sun)
│    │    │    │    └───── month (1 - 12)
│    │    │    └────────── day of month (1 - 31, L)
│    │    └─────────────── hour (0 - 23)
│    └──────────────────── minute (0 - 59)
└───────────────────────── second (0 - 59, optional)
```

You can also use [more readable formats](https://www.npmjs.com/package/friendly-node-cron), like:

* "every 15 minutes"
* "at 13:37 on fridays tuesdays and thursdays"
* "at 00:00 on dec 24"
* "quarterly at 9:30 on mondays"
* "on jan feb mar only mondays tuesdays and saturdays at 9:30"

For consistency, all commands (build, status, etc) always show the schedule as a cron expression.

:::note UTC

All schedules are in UTC, so `5 4 * * *` means "04:05 AM UTC".
:::


## Timeout

Scheduled jobs have a default timeout of 5 minutes, and a maximum timeout of 15 minutes.

However, jobs that run more frequently, you want a shorter timeout to handle overlap.

If you don't specify a timeout, the default timeout is either 5 minutes, or the time difference between subsequent runs, whichever is lower.

For example, if you schedule the job to run every minute, the default timeout would be 60 seconds. If you schedule the job to run every day, the default timeout would be 5 minutes.

The maximum timeout is 15 minutes, but it cannot be longer than the time difference between subsequent runs.

If you have significant workload that needs more time to process, [read about using queues](#retries-and-queues).

```ts
// This job needs more than 5 minutes to complete
export const config = {
	timeout: "15m"
};
```

:::tip Abort Signal

If the scheduled job runs frequently, two runs can happen in parallel and do duplicate work.

To prevent overlap, use the abort signal to terminate the job early. For example:

```ts
export default async function({ signal }) {
  const items = await db.loadWorkItems();
  for (const item of items) {
    await doSomeWork(item);
    if (signal.aborted) return;
  }
}
```
:::


## Retries and Queues

There is no retry mechanism for scheduled jobs.

If the job runs frequently enough, you may not need to worry about that. For example, a job that runs every minute to monitor another service.

If the job runs less frequently, and you need it to make progress, consider using the scheduled job in combination with queues.

For example, a job that runs every day to send email reports. If the job fails to complete, you can [run it manually](#run-job-manually). A queue would retry the job for you.

The recommended practice is for the scheduled job to do the minimum amount of work, and split large workloads across multiple jobs.

```ts title=schedules/reports.ts
import { queue as reportQueue } from '#queues/report.js';

export default async function() {
  let nextToken;
  do {
    const batch = await db.findUsers({ nextToken });
	await reportQueue.push({ users: batch.items });
	nextToken = batch.nextToken;
  } while (nextToken);
}
```

Queues are also useful when you have a substantial workload that you need to spread out over time.

For example, to limit load on the database, you can use a [FIFO queues](queues.md) to run all jobs in sequence.

If you're sending emails and you want to avoid bursts that could be flagged as spam, you can add a time delay to your queue function.

:::tip Monitor Your Jobs

To make sure your jobs are completely failing, consider using a separate service to [monitor them](#monitoring).
:::


## Testing and Deploying

You can test your scheduled job locally using the dev server.

Run the dev server in one terminal, and use the `schedule` command from a second terminal:

```bash
npx queue-run dev

# in a separate session
npx queue-run schedule my_schedule
```

If you have a maintenance window, you can use `npx queue-run reserved 0` to shut down your backend ([learn more](optimizing#reserved-concurrency)). This will also disable all scheduled jobs.


## Run Job Manually

You can also manually trigger a scheduled job in production:

```bash
npx queue-run schedule my_schedule --prod
npx queue-run logs
```


## Monitoring

The `npx queue-run status` command lists each schedule, when it last ran, and when it's expected to run next:

```
 Schedule │ Recurring  │ Last run             │ Next run
 daily    │ 0 12 * * * │ 2/4/2022, 3:59:00 AM │ 2/5/2022, 4:00:00 AM
```

The logs will show when the job starts and finishes, and any errors:

```
2/4/2022, 4:00:07 AM: [INFO] Job started: name="daily" schedule="0 0 12 * * *" job="77ccfc1f-f6f9-c6d4-b58f-501022db55f6"

2/4/2022, 4:00:07 AM: [INFO] Job finished: name="daily" jobId="77ccfc1f-f6f9-c6d4-b58f-501022db55f6"
```

:::tip Monitoring

Monitoring should be separate from your backend so it's not subject to the same failure mode.

Use a service like [cronitor.io](https://cronitor.io) or [healthchecks.io](https://healthchecks.io) to monitor your scheduled job.
:::

When using a monitoring service, you can ping the service from job function itself, or using middleware:

```ts
import { logJobFinished, logOnError } from "queue-run";
import * as Sentry from "sentry";

export default async function() {
  // do something
}

// Ping this URL when finished or error
const checkUrl = "https://hc-ping.com/eb095278-f28d-448d-87fb-7b75c171a6aa";

export async function onJobFinished(job) {
  logJobFinished(job);
  await fetch(checkUrl);
}

export async function onError(error, job) {
  logOnError(error, job);
  await fetch(checkUrl + "/fail");
  Sentry.captureException(error);
}

export const schedule = "daily";
```

If you have common middleware for all your scheduled job, you can move it to `schedules/_middleware.ts` and/or `index.ts`.

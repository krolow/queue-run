# Scheduled Jobs

Scheduled jobs allow your backend to do work on recurring schedule:

* Fetch RSS feeds every hour
* Update statistics every midnight
* Cleanup expired database records every weekend
* Send a status report every Monday and Friday morning
* Run payroll on the 1st and 15th of every month

```ts title=schedules/daily_metrics.ts
export default async function() {
  const metrics = await loadMetrics("1d");
  const html = render(template, { metrics });
  await sendEmail({ to: process.env.EMAIL, html });
}

export const schedule = "daily";
```

What you get out of the box:

* Go from "I wrote this function" to "it now runs every morning" in under 2 minutes
* QueueRun will deploy your functions and set up the schedule execution rules for you
* AWS Lambda and EventBridge will make sure it runs like clockwork.
* Use the `schedule` command to test your function locally, and run a scheduled job in production at any time
* Use the `status` and `metrics` commands to check on your schedule
* For resilient execution and scaling workloads, combine schedules with standard and FIFO queues


## The Scheduled Job Function

A scheduled job is a function that lives in the `schedules` directory.

Each file is one schedule and one function that will execute on that schedule.

The default export is the function that will be called to execute that job.

The export named `schedule` defines [when and how often the job run](#the-schedule-expression).

For example, if you have a job that needs to run once a day for up to 15 minutes:

```ts title=schedules/report.ts
// The default export function called on schedule
export default async function({ jobId, signal }) {
  // so some work here
}

// Required to schedule the job
export const schedule = "daily";

// Only necessary if you don't want default value
export const config = {
  timeout: "15m"
};
```

The function is called with the following named parameters:

* `cron` — The schedule as a cron expression
* `jobId` — Unique identifier for each run
* `name` — The name of this schedule
* `signal` — The abort signal

The file can also export the `config` object (see [timeout](#timeout)).



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

:::info UTC

Schedule expressions are always in UTC. 

The expression `15 4 * * *` means "04:15 AM UTC".

The `log`, `status` and `metrics` commands display the time in the local timezone.
:::


## Timeout

Scheduled jobs have a default timeout of 5 minutes, and a maximum timeout of 15 minutes.

If you don't specify a timeout, the default timeout is either 5 minutes, or the time difference between subsequent runs, whichever is lower.

For example, if you schedule the job to run every minute, the default timeout would be one minute. If you schedule the job to run once a day, the default timeout would be 5 minutes.

The maximum timeout is 15 minutes, but it cannot be longer than the time difference between subsequent runs.

```ts
export const schedule = "daily";

// This job needs more than 5 minutes to complete
export const config = {
	timeout: "15m"
};
```

If you have significant workload that needs more time to process, [read about using queues](#retries-and-queues).

:::tip Abort Signal

If the scheduled job runs frequently, one run my start before the previous run completed, doing duplicate and possibly conflicting work.

Use the [abort signal](timeout.md) to deal with this situation and terminate the job early.
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

Run the dev server in one terminal, and use the `dev schedule` command from a second terminal:

```bash
npx queue-run dev

# in a separate session
npx queue-run dev schedule my_schedule
```

If you have a maintenance window, you can use `npx queue-run reserved 0` to shut down your backend ([learn more](optimizing#reserved-concurrency)). This will also disable all scheduled jobs until you add or reset reserved concurrency.


## Schedule Never

The schedule value "never", `false`, or `null`, means that schedule job would not run on its own.

You can use this to to temporarily take a scheduled job out of rotation, without having to delete the code. Simply change the scheduled and re-deploy.

The scheduled job will show when you use the `build` command with "never" as the schedule, since it reports all available schedules, and you can run this schedule manually.

It will not show when you use the `status` command, since this command only reports on schedules that are scheduled to run in the future.

You can also use this to create scheduled jobs that you [run manually](#run-job-manually) ie "on your schedule".


## Run Job Manually

There are cases when you need to run a job outside its normal schedule, or on your schedule.

You can trigger a scheduled job in production using the `schedule` command:

```bash
npx queue-run schedule my_schedule
npx queue-run logs
```

The `schedule` command does not wait for the schedule to complete. Use the `logs` command to monitor progress.


## Monitoring

The `npx queue-run status` command lists each schedule, when it last ran, and when it's expected to run next:

```
 Schedule │ Recurring  │ Last run             │ Next run
 daily    │ 0 12 * * * │ 2/4/2022, 3:59:00 AM │ 2/5/2022, 4:00:00 AM
```

The logs will show when the job starts and finishes, and any errors:

```
2/4/2022, 4:00:07 AM: [INFO] Schedule started: "daily" schedule="0 0 12 * * *" jobId="77ccfc1f-f6f9-c6d4-b58f-501022db55f6"

2/4/2022, 4:00:07 AM: [INFO] Schedule finished: "daily" jobId="77ccfc1f-f6f9-c6d4-b58f-501022db55f6"
```

The `npx queue-run metrics schedule <name>` command will show the invocation metrics for that schedule:

* `Invoked` – How many times the function was invoked 
* `Failed` — How many times the invocation failed


:::tip Monitoring

Monitoring should be separate from your backend so it's not subject to the same failure mode.

Use a service like [cronitor.io](https://cronitor.io) or [healthchecks.io](https://healthchecks.io) to monitor your scheduled job.
:::

When using a monitoring service, your handler would look like:

```ts
export default async function() {
  try {
    // do something

    await fetch(checkUrl);
  } catch (error) {
    await fetch(checkUrl + "/fail");
    // Generic error logging
    throw error;
  }
}

// Ping this URL when finished or error
const checkUrl = "https://hc-ping.com/eb095278-f28d-448d-87fb-7b75c171a6aa";

export const schedule = "daily";
```

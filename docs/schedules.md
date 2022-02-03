# Scheduled Jobs

Scheduled jobs allow you to do work in the background:

* Send a status report every morning
* Fetch RSS feeds every hour
* Cleanup expired records every weekend


## The Job Handler

Each schedule has one file which exports the job handler. The file name is used as the schedule name.

Scheduled jobs do not have a payload. Nor are they associated with a user.

The job handler is called with metadata about the job:

* `cron` — The schedule's cron expression
* `jobId` — Unique identifier for this job
* `name` — The name of this schedule
* `signal` — The abort signal, raised when the job has timed out

:::tip Abort Signal

To prevent the same scheduled job from running concurrently, pay attention to the [abort signal](timeout.md).
:::


## The Schedule

The schedule must have a named export called `schedule`.

It can be [a cron expression](https://crontab.guru). A cron expression has the following form: 

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

Or human readable expression, [like](https://www.npmjs.com/package/friendly-node-cron):

- "every 15 minutes"
- "at 13:37 on fridays tuesdays and thursdays"
- "at 00:00 on dec 24"
- "quarterly at 9:30 on mondays"
- "on jan feb mar only mondays tuesdays and saturdays at 9:30"

For precision, when commands like `build` and `status` show a schedule, they will always show the cron expression.

The maximum timeout for a scheduled job is 15 minutes (Lambda limit). The spacing between runs cannot be shorted than the timeout. For example, if the schedule is "every 5 minutes", then the timeout cannot be longer than "5m".

The default timeout for a scheduled job is 5 minutes. However, if you specify a schedule that runs more frequently (eg every minute), the default timeout will adjust accordingly.

:::tip Error Handling

The recommended practice for scheduled jobs is that the job itself shouldn't run for any extended period of time, since there's no retry mechanism.

If the job runs frequently enough (for example, polling from another service every minute), then if one job fails, the next job will pick up where it left off.

If the job runs less frequently (for example, sending email report every morning), you want to have a retry mechanism. The scheduled job should decide what works needs to happen, split it into smaller batches, and queue a job for each batch.
:::

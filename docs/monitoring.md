
# Monitoring & Visibility

## Status

Use the `status` command to see the current status of your project:

* When your backend was deployed, version number, code size, region, etc
* Reserved and provisioned concurrency (see [Optimizing](optimizing.md))
* HTTP and WebSocket URLs
* Queues, showing number of jobs processed, in flight, and age of oldest job in the last 5 minutes
* Schedules, showing when the scheduled job ran last time, and when it's expected to run again

```
 Project                  │ grumpy-sunshine
 Version                  │ 359
 Deployed                 │ 2022-02-03 10:23:35
 Available memory         │ 5.12 GB
 Timeout                  │ 5m
 Code size                │ 1.27 MB
 Region                   │ us-east-1
 CloudFormation           │ create complete
 Reserved concurrency     │ no reserve
 Provisioned concurrency  │ READY
  - Requested             │ 3
  - Allocated             │ 3
  - Available             │ 3
 HTTP                     │ https://grumpy-sunshine.queue.run
 WebSocket                │ wss://ws.grumpy-sunshine.queue.run

Queue       │ Processed (5m) │ In flight │ Oldest
screenshots │ 0              │ 0         │ n/a

Schedule │ Recurring  │ Last run            │ Next run
daily    │ 0 12 * * * │ 2022-02-06 03:59:00 │ 2022-02-07 04:00:00
```


## Logs

Use the `logs` command to watch the server logs.

You can use Ctrl+C to stop, and Ctrl+L to clear the screen.

If you only want to retrieve the latest logs, use `--no-watch` in combination with `--hours`.

```
2022-02-05 04:00:06: [INFO] Schedule started: "daily" schedule="0 0 12 * * *" jobId="4b34115c-f94a-1c20-0a91-c4c22a9f436f"
2022-02-05 04:00:06: [INFO] Schedule finished: "daily" jobId="4b34115c-f94a-1c20-0a91-c4c22a9f436f"
2022-02-05 12:49:44: [INFO] [136.25.153.66] "GET /" 200 814 "" "Mozilla/5.0 (Windows NT 6.1; rv:45.0) Gecko/20100101 Firefox/45.0"
```

:::note

There's typically a few seconds delay between when the logs are created and when they appear on the screen.
:::


## Metrics

Use the `metrics` command to see metrics about:

* Lambda: invocations, throttled requests, errors, concurrency, execution duration
* HTTP: requests, 4xx and 5xx responses, response time
* WebSocket: new connections, messages sent and received, errors, response time
* Queues: jobs queued, jobs processed, in-flight, and age of oldest message
* Schedules: scheduled jobs invocations and failed invocations

The default time range is the last 12 hours. You can change the time range with the `--range` option:

```bash
# Last 30 minutes, resolution is 1 minute
npx queue-run metrics --range 30m

# Last 8 hours, resolution is 10 minutes
npx queue-run metrics --range 8h

# Last 30 days, resolution is 1 day
npx queue-run metrics --range 30d
```

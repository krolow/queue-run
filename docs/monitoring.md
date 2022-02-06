
# Monitoring & Visibility

## Status

Use the `status` command to see the current status of your project:

* When your backend was deployed, version number, code size, region, etc
* Reserved and provisioned concurrency (see [Optimizing](optimizing.md))
* HTTP and WebSocket URLs
* Queues, showing number of jobs processed, in flight, and age of oldest job in the last 5 minutes
* Schedules, showing when the scheduled job ran last time, and when it's expected to run again

```
 Name         : grumpy-sunshine
────────────────────────────────────────────────────
 Version      : 358
 Code size    : 1.27 MB (compressed)
 Deployed     : 2/2/2022, 9:52:30 PM
 Region       : us-east-1
 Avail memory : 5.12 GB
 Timeout      : 15m
 Reserved     : no reserve
 Provisioned  : IN_PROGRESS
 — Requested  : 2
 — Allocated  : 0
 — Available  : 0

 HTTP         : https://grumpy-sunshine.queue.run
 WebSocket    : wss://ws.grumpy-sunshine.queue.run
```


## Logs

Use the `logs` command to watch the server logs.

You can use Ctrl+C to stop, and Ctrl+L to clear the screen.

If you only want to retrieve the latest logs, use `--no-watch` in combination with `--hours`.

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

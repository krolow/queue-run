# Miscellaneous

## Timeout and Abort Signal

Each task is given a finite time to complete. The default timeout depends on the task: 10 seconds for HTTP and WebSocket requests, 5 minutes for queued and scheduled jobs.

You can change the timeout by exporting `export const config = { timeout: inSeconds };`.

A responsive API should respond in matter of milliseconds, with few requests taking longer than that. If you intend to do a lot of processing, use [queues](Queues).

When the request times out, the server responds with status code 504. This tells the client their request has not completed, and they can repeat it, show an error to the user, etc.

For WebSocket, you can send the client a message at any time, from another request or queued job. The WebSocket request does not have to complete with a response.

If the WebSocket request times out, that's treated as an error, and the server will response with an error message (`{ error: message }`).

:::info Quick Responses and Queues

If you're doing anything lengthy, there's a chance it will fail. HTTP responses with an error are not a great user experience. And WebSocket doesn't have a solid error hanlding model.

In either case, you get a more responsive UI and better user experience by keeping request/response short and simple, and offloading everything else to a queue.
:::

For queued jobs, if the job times out, it returns to the queue and will be retried again.

Your application can make progress by breaking large pieces of work into smaller jobs, that will execute in parallel. Here too there's a benefit to setting a relatively short execution time (seconds or minutes).

The recommended practice for scheduled jobs is that the job itself shouldn't run for any extended period of time, since there's no retry mechanism.

If the job runs frequently enough (for example, polling from another service every 15 minutes), then if one job fails, the next job will pick up where it left.

If the job runs less frequently (for example, sending email reports once a day), you want to have a retry mechanism. The scheduled job should split the work into batches and queue these batches.

Because timeout typically means the task could run again, you want to watch [the abort signal](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal) and stop processing on timeout.

For example:

```ts
export default async function(job, { signal }) {
  await doSomething();
  if (signal.aborted) return;

  await doSomethingElse();
  if (signal.aborted) return;

  await doEvenMoreStuff();	
}
```

Some libraries, like [`fetch`](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API) and AWS SDKs, accept an abort signal and will fail early if the signal is raised. For example:

```ts
export default async function(job, { signal }) {
  const response = await fetch(url, { signal });
  const data = await response.json();
  // do something with the data
}
```

:::info OnError

If the task times out, the `onError` middleware is called with a `TimeoutError` exception.
:::


## Logging

Turns out that [`console`](https://developer.mozilla.org/en-US/docs/Web/API/console) is good enough for logging and you probably don't need a logging library:

* You can log with different levels: debug, verbose, info, warn, errors
* Handy logging features like `count`, `time`, `trace`, and `table`
* 3rd party libraries you may use in your code are also using console logging
* QueueRun will add colors when running in the terminal
* You can intercept logs and send them to 3rd party logging service

There are five logging levels. You can `console.log` everything, but using different levels helps filter and make sense of the logs.

The standard `console.log` has the level "verbose". All other convenience methods (`count`, `time`, `table`, etc) use that logging level as well.

In development, `console.warn` and `console.error` go to `stderr`. Warnings will show in yellow, and errors will show in red.

In development, you will see `console.debug` messages unless you set the environment variable `DEBUG=false`.  In production, you will not see `console.debug` messages unless you set the environment variable `DEBUG=true`.

:::note
After changing an environment variable, you need to re-deploy your project for the change to take effect.
:::

:::tip Logging Variables

To log a variable, wrap it as an object. If you use `console.log(variable)` and the variable is `null`, `undefined`, or an empty string, you won't see anything in the log.

Example:

```ts
let value;
console.log(value);
=> 

console.log({ value });
=> { value: undefined }
```
:::


### Using a Logging Service

You can provide your own logging function. This is useful if you want to send all logged message to a 3rd party logging service.

For example, to use with LogTail:

```ts title=warmup.ts
import { format } from 'node:util';
import { logging } from 'queue-run';
import { Logtail } from "@logtail/node";

const logger = logging();
const logtail = new Logtail(process.env.LOGTAIL_TOKEN);

logging(function(level, args) {
  // Output to stdout/stderr
  logger(level, args);
  
  // Format messsage, pass argument list as rest parameters
  const message = format(...args);
  logtail.log(message);
});
```


### Logging Middleware

Since logging is such a common use case, QueueRun includes default logging middleware. It will log:

* HTTP responses
* WebSocket responses and messages sent
* Queued job started and finished
* Scheduled job started and finished
* Errors when handling HTTP/WebSocket request, or queued/scheduled job

You can change the default middleware by exporting your own middleware. And you can wrap the default middleware.


### Logging Errors

The `onError` middleware helps you track errors. This middleware is called with the underlying `Error` object, and a reference object.

The reference object depends on the task:

* HTTP — The `Request` object
* WebSocket — Request object passed the handler
* Queues — The job metadata

For example, to send errors to Sentry:

```ts title=api/_middleware.ts
const { logError } from 'queue-run';
import * as Sentry from "@sentry/node";

export async function logError(error, request) {
  logError(error, request);
  Sentry.captureException(error);
}
```

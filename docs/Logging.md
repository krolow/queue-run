# Logging

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


## Logging Middleware

Since logging is such a common use case, QueueRun includes default logging middleware. It will log:

* HTTP responses
* WebSocket responses and messages sent
* Queued job started and finished
* Scheduled job started and finished
* Errors when handling HTTP/WebSocket request, or queued/scheduled job

QueueRun calls the following middleware:

- `onRequest(request)` — Called on every HTTP request
- `onResponse(request, response)` — Called on every HTTP response
- `onMessageReceived(request)` — Called on every WebSocket request
- `onMessageSent(message)` — Called for every WebSocket message sent
- `onJobStarted(metadata)` — Called each time a job starts running
- `onJobFinished(metadata)` — Called each time a job finishes running (not error or timeout)
- `onError(error, reference)` — Called for errors, see [Logging Errors](#logging-errors)

Middleware loads in the following order:

* Middleware exported from the module itself (HTTP request handler, job handler, etc)
* Middleware exported from `_middleware.ts` in the current directory
* Middleware exported from `_middleware.ts` in the parent directory (recursive)
* The default middleware

You can change the default middleware by exporting different middleware. You can disable middleware by exporting `null`. And you can wrap middleware.

For example:

```ts title=api/_middleware.ts
// We're going to use the default middleware for logging
import { logResponse } from "queue-run";
// Metrics package for counting request/responeses
import { metrics } from "metrics";

export async function onRequest(request, response) {
  await metrics.increment(`request.${request.method}`);
}

export async function onResponse(request, response) {
  await logResponse(request, response);
  await metrics.increment(`response.${response.status}`);
}
```

:::note Throwing Errors and Responses

* `onRequest` is called first (before authentication) so does not have access to the current user
* `onRequest` can prevent the request from being handled by throwing a `Response` object (eg 404, or redirect to different URL)
* `onResponse` can change the response by throwing a new `Response` body (eg hide errors in 500 responses)
* If the request handler throws an `Error`, then the 500 response is logged (`onResponse`) as well as the error object (`onError`).
* If `onResponse` throws an `Error`, then the server responds with 500 and calls `onError`
:::


## Logging Errors

The `onError` middleware helps you track errors. This middleware is called with the underlying `Error` object, and a reference object.

The reference object depends on the task:

* HTTP — The `Request` object
* WebSocket — Same object passed to request handler
* Queues — The job metadata (second argument for job handler)
* Other would be `undefined`

For example, to send errors to Sentry in production:

```ts title=_middleware.ts
import { logError } from "queue-run";
import * as Sentry from "@sentry/node";

if (process.env.SENTRY_DSN)
  Sentry.init({ dsn: process.env.SENTRY_DSN });

export async function logError(error, reference) {
  logError(error, reference);
  if (process.env.SENTRY_DSN)
    Sentry.captureException(error);
}
```


## Using a Logging Service

You can provide your own logging function. This is useful if you want to send all logged message to a 3rd party logging service.

For example, to use with LogTail:

```ts title=_middleware.ts
import { format } from "node:util";
import { logger } from "queue-run";
import { Logtail } from "@logtail/node";

const logtail = new Logtail(process.env.LOGTAIL_TOKEN);
const _logger = logger();

logger(function(level, ...args) {
  // Output to stdout/stderr
  _logger(level, ...args);
 
  // Format messsage, pass argument list as rest parameters
  const message = format(...args);
  logtail.log(message);
});
```

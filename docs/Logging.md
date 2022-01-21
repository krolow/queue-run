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


## Using a Logging Service

You can provide your own logging function. This is useful if you want to send all logged message to a 3rd party logging service.

For example, to use with LogTail:

```ts title=index.ts
import { format } from "node:util";
import { logging } from "queue-run";
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


## Logging Middleware

Since logging is such a common use case, QueueRun includes default logging middleware. It will log:

* HTTP responses
* WebSocket responses and messages sent
* Queued job started and finished
* Scheduled job started and finished
* Errors when handling HTTP/WebSocket request, or queued/scheduled job

You can change the default middleware by exporting your own middleware. And you can wrap the default middleware.


## Logging Errors

The `onError` middleware helps you track errors. This middleware is called with the underlying `Error` object, and a reference object.

The reference object depends on the task:

* HTTP — The `Request` object
* WebSocket — Request object passed the handler
* Queues — The job metadata

For example, to send errors to Sentry:

```ts title=api/_middleware.ts
import { logError } from "queue-run";
import * as Sentry from "@sentry/node";

export async function logError(error, request) {
  logError(error, request);
  Sentry.captureException(error);
}
```

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

You can add your own logging, by listening to the following events:

- `logger.on('error')` — Called specifically for errors
- `logger.on('messageReceived', wsRequest)` - Called for every WebSocket message received
- `logger.on('messageSent', message)` - Called for every WebSocket message sent
- `logger.on('queueFinished', metadata)` - Called for every queued job when finished successfully
- `logger.on('queueStarted', metadata)` - Called for every queued job on start
- `logger.on('request', request)` - Called for every HTTP request
- `logger.on('response', request, response)` - Called for every HTTP response
- `logger.on('scheduleFinished', metadata)` - Called for every scheduled job when finished successfully
- `logger.on('scheduleStarted', metadata)` - Called for every scheduled job on start

For example, if you wanted to count HTTP requests/responses:

```ts title=index.ts
import { logger } from "queue-run";

logger.on("request", (request) => {
  await metrics.increment(`request.${request.method}`);
});

logger.on("response", (request, response) => {
  if (response.statusCode >== 500)
    await metrics.increment(`response.5xx`);
  else if (response.statusCode >== 400)
    await metrics.increment(`response.4xx`);
});
```


## Using a Logging Service

You can intercept the logger and send messages to a service of your choice.

For example:

```ts title=index.ts
import { format } from "node:util";
import { logger } from "queue-run";
import { Logtail } from "@logtail/node";

const logtail = new Logtail(process.env.LOGTAIL_TOKEN);

// console.log, console.info, console.error, etc
// send to logging service
logger.on("log", (level, ...args) => {
  const message = format(...args);
  if (level === "error) logtail.error(message);
  else logtail.log(message);
});

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    release: process.env.GIT_TAG ?? process.env.GIT_SHA,
    attachStacktrace: true,
  });
  // This listens to errors that cause the process to crash,
  // or otherwise reported with call to reportError
  logger.on("error", (error) => Sentry.captureException(error));
}
```

:::tip reportError

Use [`reportError`](https://developer.mozilla.org/en-US/docs/Web/API/reportError) with an `Error` object when you want to:

- Report the error but throw an error/terminate the process
- Send it to all `on(error)` event handler
- Including error monitoring service (as shown in example above)
- And showing in the console/log (default behavior)

Use `console.error` when you want to show additional information in the console/log, but not necessarily trigger an error condition.
:::

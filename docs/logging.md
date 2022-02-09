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

- `logger.on('request', request)` - Called for every HTTP request
- `logger.on('response', request, response)` - Called for every HTTP response
- `logger.on('messageReceived', wsRequest)` - Called for every WebSocket message received
- `logger.on('messageSent', message)` - Called for every WebSocket message sent
- `logger.on('jobStarted', metadata)` - Called for every queued or scheduled job on start
- `logger.on('jobFinished', metadata)` - Called for every queued or scheduled job when finished successfully
- `logger.on('error')` — Called specifically for errors

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
  if (level === "error)
    logtail.error(message);
  else
    logtail.log(message);
});

// unhandled errors and rejected promises only
// send to error tracking service
logger.on("error", (error) => {
  Sentry.captureException(error);
});
```

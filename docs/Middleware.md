# Middleware

## HTTP Resources

There are common middleware patterns in HTTP APIs. This middleware is supported through named exports:

- `authenticate(request)` - Used to authenticate the request, see [Authentication](Authenticate.md)
- `onError(error, request)` — You can use this to log processing errors
- `onRequest(request)` - You can use this to log the request, also block a request by throwing a Response object
- `onResponse(request, response)` — You can use this to log the response, or change the response by throwing a Response object

You can export middleware directly from the route file, but it's far more common to share middleware. Shared middleware lives in the file `_middleware.ts`.

The most specific middleware is always used, so the route can over-ride middleware from the `_middleware.ts` in the same directory, which itself over-rides middleware from the parent directory, and the defult middleware.

For example, you can use `api/_middleware.ts` to make sure your entire API is authenticated, and use `export const authenticate = null;` in some files to enable un-authenticated access to specific resources.

If the request handler throws a `Response` object, that response is logged (`onResponse`) but is not considered an error.

If the request handler throws an exception, then a 500 response is logged (`onResponse`) as well as the error (`onError`).

That also includes anything thrown from `authenticate`, `onRequest` and `onResponse`, all of which run in the same context.

Logging is such a common use case that it's enabled by default. You can disable logging by exporting `export const onResponse = null;` and `export const onError = null;`.

You can also augment the default logging with your own. For example:

```ts title="api/_middleware.ts"
import { logResponse, logError } from 'queue-run';

export async function onRequest(request, response) {
  await logResponse(request, response);
  await metrics.increment(`request.${request.method}`);
}

export async function onResponse(request, response) {
  await logResponse(request, response);
  await metrics.increment(`response.${response.status}`);
}

export async function onError(error, request) {
  await logError(error, request);
  await metrics.increment(`error`);
}
```


## Logging Queues

Queues support the following middleware functions:

- `onJobStarted(metadata)` — Called each time the job runs
- `onJobFinished(metadata)` — Called when the job finishes successfully
- `onError(error, metadata)` — Called when the job fails with an error

The default middleware logs the job starting and finishing and any errors.

You can export different middleware for all queues from `queues/_middleware.js`, or for a specific queue from the module itself. You can disable the default middleware by exporting `undefined`.

Your middleware can wrap the default middleware, available as `logJobStarted`, `logJobFinished`, and `logError` respectively.

For example, to count running jobs and errors:

```ts title="queues/_middleware.js"
import {
  logJobStarted,
  logJobFinished,
  logError
} from 'queue-run';

export async function onJobStarted(metadata) {
  await logJobStarted(metadata);
  await metrics.increment(`jobs.${metadata.queueName}`);
}

export async function onJobFinished(metadata) {
  await logJobFinished(metadata);
  await metrics.decrement(`jobs.${metadata.queueName}`);
}

export async function onError(error, metadata) {
  await logError(error, metadata);
  await metrics.increment(`errors.${metadata.queueName}`);
}
```
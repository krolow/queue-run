# Queues

## Standard Queues

**TBD**

## FIFO Queues

**TBD**

## Queuing a job

The `queues(name)` function gives you access to the named queue.

Each queue has a `push(payload)` method for queuing a job. You can queue an
object, a string, or a Buffer. The payload cannot be an empty string/buffer.

If you use a FIFO queue, you must set the group ID before queuing a job. You can
also set the deduplication ID. If you don't set the deduplication ID, it's
calculated from the payload.

```ts
import { queues } from 'queue-run';

const job1 = await queues('tasks').push(task);

const job2 = await queues('profile.fifo')
  .group(userID)
  .push(profile);

const job3 = await queues('payment.fifo')
  .group(accountID)
  .dedupe(transactionID)
  .push(amount);
```

:::info JSON Serialization

If you queue an object, the object is serialized to JSON. Some values will convert to strings. For example, `Date` objects turn into strings. Circular references will cause an error.
:::

## queues.self()

You can use the `queues.self()` function to get a reference to the current queue.

For example:

```js title="queues/tasks.js"
import { queues } from 'queue-run';

export default async function(task) {
  ...
}

// highlight-next-line
export const queue = queues.self();
```

```js title="api/tasks.js"
import { queue as tasks } from '~/queues/tasks.js';

export async function post(request) {
  const task = await request.json();
  // highlight-next-line
  await tasks.push(task);
  return new Response(null, { status: 202 });
}
```

## queue.http

You can export a queue as an HTTP POST method.

The queue will accept JSON documents (`application/json`), HTML forms (`application/x-www-form-urlencode` or `multipart/form-data`), and plain text (`text/plain`).

It will respond with status code 202 (Accepted) and the header `X-Job-ID` with the job ID.

For FIFO queues, the route must include the `[group]` named parameter, which captures the group ID. It may also include the `[dedupe]` named parameter, if you want to set the deduplication ID.

The queue handler will be called with the parsed HTTP request, and in the second argument:

- `params` — any parameters from the URL path
- `user.id` — user ID, if the request was authenticated

For example:

```ts title=api/tasks.ts
import { queue as updates } from '~/queues/update.js';
import { queues } from 'queue-run';

export const post = updates.http;

// We only care about JSON and HTML forms
export const config = {
  accepts: ['application/json', 'application/x-www-form-urlencode']
}
```

```ts title=queues/update.ts
import { queues } from 'queue-run';

export default async function(payload: object, { user }) {
  console.info("Authenticated user ID: %s", user.id)
  console.info("Payload object: %o", payload);
}

export const queue = queues.self();
```


## Using TypeScript

When using TypeScript, you can apply a type to the queue payload:

For example:

```ts title="queues/tasks.ts"
import { queues } from 'queue-run';

export type Task = {
  id: string;
  name: string;
  description: string;
};

export default async function(task: Task) {
  // Payload is typed
  // highlight-next-line
  console.log("Task id: %s", task.id);
}

// highlight-next-line
export const queue = queues.self<Task>();
```

```ts title="api/tasks.ts"
import { queue, Task } from '../queues/tasks';

export async function post(request) {
  ...
  // This checks the type of the payload.
  // highlight-next-line
  await queue.push({ id, name, description });
  return new Response(null, { status: 202 });
}
```


## Logging Middleware

Queues support the following middleware functions:

- `onJobStarted(metadata)` — Called each time a job starts running
- `onJobFinished(metadata)` — Called each time a job finishes running (except error/timeout)
- `onError(error, metadata)` — Called when job processing fails with an error (including timeout)

The default middleware logs the job when it starts running, finishes, or any error.

You can change the middleware for a given queue by exporting functions with any of these names, or `null` to disable the middleware.

You can use the same middleware across all queues by exporting it from `queues/_middleware.ts`.

Your middleware can wrap the default middleware.

For example:

```ts title=queues/_middleware.js
// We're going to use the default middleware for logging
import {
  logJobStarted,
  logJobFinished,
  logError
} from 'queue-run';
// And count running/failed jobs
import { metrics } from 'metrics';

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


## Failure and Retries

**TBD**
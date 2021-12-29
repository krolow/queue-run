# Working With Queues

## Standard Queues


## FIFO Queues



## Queuing a job

The `queues(name)` function gives you access to the named queue.

Each queue has a `push(payload)` method for queuing a job. You can queue an
object, a string, or a Buffer. The payload cannot be an empty string/buffer.

If you queue an object, the object is serialized to JSON. Some values will convert to strings. For example, `Date` objects are stored as the ISO 8601 string. Circular references will cause an error.

If you use a FIFO queue, you must set the group ID before queuing a job. You can
also set the deduplication ID. If you don't set the deduplication ID, it's
calculated from the payload.

```ts
import { queues } from 'queue-run';

const job1 = await queues('tasks').push(task);
const job2 = await queues('profile.fifo')
  .group(userID).push(profile);
const job3 = await queues('payment.fifo')
  .group(accountID)
  .dedupe(transactionID)
  .push(amount);
```


## queues.self()

You can use the `queues.self()` function to get a reference to the current queue.

For example:

#### queues/tasks.js
```js
import { queues } from 'queue-run';

export default async function(task) {
  ...
}

export const queue = queues.self();
```

#### api/tasks.js
```js
import { queue } from '../queues/tasks';

export async function post(request) {
  ...
  await queue.push(task);
  return new Response(null, { status: 202 });
}
```


## queue.http

You can export a queue as an HTTP POST method.

The queue will accept JSON documents (`application/json`), HTML forms (`application/x-www-form-urlencode` or `multipart/form-data`), and plain text (`text/plain`). You can limit accepted content types using `config.accepts`;

It will respond with status code 202 (Accepted) and the header `X-Job-ID` with the job ID.

For FIFO queues, the route must include the `[group]` named parameter, which captures the group ID. It may also include the `[dedupe]` named parameter, if you want to set the deduplication ID. All named parameters will be available to the queue handler in the second argument.

If the API is authenticated, the queue handler will receive the user ID in the second argument.

For example:

#### api/tasks.js
```js
import { queues } from 'queue-run';

export const post = queues.get('tasks').http;

export const config = {
  accepts: 'application/json'
}
```


## Using TypeScript

When using TypeScript, you can apply a type to the queue payload:

For example:

#### queues/tasks.ts
```ts
import { queues } from 'queue-run';

export type Task = {
  id: string;
  name: string;
  description: string;
};

export default async function(task: Task) {
  ...
}

export const queue = queues.self<Task>();
```

#### api/tasks.ts
```ts
import { queue, Task } from '../queues/tasks';

export async function post(request) {
  ...
  const task : Task = {
    ...
  };
  // This checks the type of the payload.
  await queue.push(task);
  return new Response(null, { status: 202 });
}
```


## Failure and Retries


## Middleware

Queues support the following middleware functions:

- `onJobStarted(metadata)` — Called each time the job runs
- `onJobFinished(metadata)` — Called when the job finishes successfully
- `onError(error, metadata)` — Called when the job fails with an error

The default middleware logs the job starting and finishing and any errors.

You can export different middleware for all queues from `queues/_middleware.js`, or for a specific queue from the module itself. You can disable the default middleware by exporting `undefined`.

Your middleware can wrap the default middleware, available as `logJobStarted`, `logJobFinished`, and `logError` respectively.

For example, to count running jobs and errors:

#### queues/_middleware.js
```js
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
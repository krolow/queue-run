# Queues

Queues are a powerful mechanism for performing work that takes longer than a request/response cycle, and building responsive applications.

* HTTP requests can offload to a queue, so the user doesn't have to wait
* Queues can notify the user when the task completes, using WebSocket
* Queues have a retry mechanism, so they can complete tasks even in the face of bugs and service issues
* FIFO queues can guarantee an order of processing and avoid race conditions
* FIFO queues can ignore duplicates, for example, from double submitting an HTML form
* Large batches of work can be split into multiple jobs that run concurrently

For example, a user updates their profile, and you want to sync these changes with the CRM, help desk, and email marketing.

The user doesn't care to wait until all these services are updated, and certainly not to retry the update if one of these services fails.

You can build a more responsive UI by updating the database directly, and then queuing a job that will run all the other updates asynchronously.

If the user makes two consecutive changes, there'a a chance for a race condition, if these updates do not perform in order. You can use FIFO queues.

If you're accepting payments, you want to make sure the user is not charged twice if they double-sumbit the form. You can use FIFO queues with deduplication.


## Queuing a Job

You can queue a job from an HTTP/WebSocket request handler, a queued job, or a scheduled job.

You need to know the queue name, and make sure you're using the correct job format.

For example:

```ts title=api/profile.ts
const { queue as updateProfile } from '#queues/update_profile.fifo.js';

type Resource = {
  body: { email: string; };
  user: { id: string; };
}

export async function put({ body, user }: Resource) {
  await db.users.update({
    id: user.id,
    email: body.email
  });
  // This is a FIFO queue, so need group ID
  // highlight-next-line
  await updateProfile.group(user.id).push(body);
}
```

```ts title=queues/update_profile.fifo.ts
import { queues } from "queue-run";

type UpdateProfile = {
  email: string;
};

// highlight-next-line
export async function({ email }: UpdateProfile) {
  // update profile in other service
  ...
}

export const queue = queues.self<UpdateProfile>();
```

The `push` method returns a unique job ID. It will throw an error if the queue doesn't exist, using FIFO queue without a group ID, or if it can't successfully queue the job.

:::info FIFO Queue Names

A FIFO queue name always ends with `.fifo`. The semantics of standard and FIFO queues are different enough that it helps you can tell the queue type from its name.
:::


## Standard vs FIFO queues

If it doesn't matter in what order jobs start and complete, use a standard queue.

For example, if you're sending email updates to multiple users, all these jobs are independent of each other. Using a standard queue means they can all run in parallel, and complete quickly.

If order matters, consider using a FIFO queue.

### Executing Jobs in Order

A FIFO queue will run jobs in sequence within the same group.

For example, you have a job for updating the user profile. The user can make a second udpate before the first update completes. If these jobs execute in any order, the first job may finish last, erasing changes from the second job.

In this case you would use the user ID as the group ID, so all jobs from the same user execute in order. Jobs from different users can execute in parallel.

FIFO queues require a group ID. You set the group ID by calling `group(id)` on the queue. For example:

```ts
await queues
  .get("update_profile.fifo")
  .group(userId)
  .push(profile);

await post
  .get("publish_post.fifo")
  .group(postId)
  .push({ title, body });
```

:::tip Use The Most Specific Group ID

Use the most specific group to make sure independent jobs do not back up.

Don't use the same group for all users. If one user's update fails, eg due to invalid input or bug that affects only their profile, all other updates will block.
:::

### Handling Duplicate Jobs

FIFO groups also support deduplication. If you queue two duplicate jobs for the same group within the same time frame (about 5 minutes), the second job is ignored.

This is useful for dealing with cases where you can't check whether the job was already queued, and you don't want the same job to execute twice.

For example, during checkout you only want to collect payment once. If the server is not responsive, the user may submit the form more than once.

You can use a unique identifier (for example, the primary key for the order) to make sure the job only executes once.

By default, each job is considered unique based on a hash of the serialized job object. In many cases you don't have to worry about setting the deduplication ID.

If this is not what you want, set the deduplication ID directly, by calling `dedupe(id)` on the queue. For example:

```ts
await queues("checkout.fifo")
  .group(user.id)
  .dedupe(order.id)
  .push(order);

await queues("debit_account.fifo")
  .group(accountId)
  .dedupe(transactionId)
  .push(amount);
```



## The Queue Handler

Each queue has one file which exports the queue handler. The file name is used as the queue name.

The queue handler is called with the payload and additional metadata. Depending on what you queue, the payload may be an object, string, or `Buffer`.

The metadata includes:

* `groupId` — The group ID (FIFO queue only)
* `jobId` — Unique identifier for this job
* `params` — Request parameters (see [queue.http](#queuehttp))
* `queuedAt` — Timestamp when the job was queued
* `queueName` — The queue name
* `receivedCount` — Approximate number of times job was received for processing
* `sequenceNumber` — The sequence number of this job in the group (FIFO queue only)
* `signal` — The abort signal, raised when the job has timed out
* `user.id` — The user identifier, if queued from an HTTP/WebSocket request


:::info Jobs are Serialized

If you queue an object, the object is serialized as a JSON document. That means that some values will convert to strings, for example, `Date` objects are serialized as ISO 8601 date string. Circular references are not allowed.
:::

If the queue handler throws an error, or times out, the job fails and returns to the queue, and may execute again.

For standard queues, the queue handler may be asked to run multiple jobs on the same process. If that's not acceptable, consider using a FIFO queue.

For FIFO queues, the queue handler may be asked to run multiple jobs, but only from the same group, and always in order, waiting for one job to finish before starting the next one.

If you queue from an HTTP/WebSocket request, or from another queue handler, the job may be associated with an authenticated user. Only the user ID is available to the job, as the user profile may have updated since the job was queued.

That allows you to ssend a WebSocket message back to the user to inform them of progress. For example:

```ts
import { socket } from "queue-run";

export default async function(order) {
	socket.send({ id: order.id, status: "preparing" });

	await prepareOrder();
	socket.send({ id: order.id, status: "packaging" });	

	await packageAndShip();
	socket.send({ id: order.id, status: "shipped" });	
}
```

The queue handler can control how jobs are processed by exporting a `config` object:

* `config.timeout` — The timeout for processing the job, in seconds (default 5 minutes)


## queues.self()

You can use the `queues.self()` function to get a reference to the current queue.

For example:

```js title="queues/tasks.js"
import { queues } from "queue-run";

export default async function(task) {
  ...
}

// highlight-next-line
export const queue = queues.self();
```

```js title="api/tasks.js"
import { queue as tasks } from "#queues/tasks.js";

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

It will respond with status code 202 (Accepted) and the header `X-Job-Id` with the job ID.

For FIFO queues, the route must include the `[group]` named parameter, which captures the group ID. It may also include the `[dedupe]` named parameter, if you want to set the deduplication ID.

The queue handler will be called with the parsed HTTP request, and in the second argument:

- `params` — any parameters from the URL path
- `user.id` — user ID, if the request was authenticated

For example:

```ts title=api/tasks.ts
import { queue as updates } from "#/queues/update.js";
import { queues } from "queue-run";

export const post = updates.http;

// We only care about JSON and HTML forms
export const config = {
  accepts: ["application/json", "application/x-www-form-urlencode"]
}
```

```ts title=queues/update.ts
import { queues } from "queue-run";

export default async function(payload: object, { user }) {
  console.info("Authenticated user ID: %s", user.id)
  console.info("Payload object: %o", payload);
}

export const queue = queues.self();
```


## Failure and Retries

**TBD**
